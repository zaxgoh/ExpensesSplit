"use client";

import { useMemo } from "react";
import { format, parseISO } from "date-fns";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/money/minorUnits";
import type { Expense, Member } from "@/types";

const MODE_LABEL: Record<string, string> = {
  equal: "Equal",
  exact: "Exact",
  percent: "Percentage",
};

export type ExpenseSortKey = "date" | "name" | "amount";
export type ExpenseSort = { key: ExpenseSortKey; direction: "asc" | "desc" };

/** Stable sort: fall back to id so equal keys never reorder between renders. */
export function sortExpenses(
  expenses: Expense[],
  sort: ExpenseSort,
): Expense[] {
  const factor = sort.direction === "asc" ? 1 : -1;
  return [...expenses].sort((a, b) => {
    let delta = 0;
    if (sort.key === "date") delta = a.date.localeCompare(b.date);
    else if (sort.key === "name") delta = a.name.localeCompare(b.name);
    else delta = a.amountMinor - b.amountMinor;
    if (delta !== 0) return delta * factor;
    return a.id.localeCompare(b.id);
  });
}

function SortButton({
  label,
  column,
  sort,
  onSort,
}: {
  label: string;
  column: ExpenseSortKey;
  sort: ExpenseSort;
  onSort: (key: ExpenseSortKey) => void;
}) {
  const active = sort.key === column;
  return (
    <button
      type="button"
      onClick={() => onSort(column)}
      aria-label={`Sort by ${label.toLowerCase()}`}
      className="inline-flex items-center gap-1.5 hover:text-foreground"
    >
      {label}
      <span
        aria-hidden
        className={
          active
            ? "text-foreground"
            : "text-muted-foreground opacity-40"
        }
      >
        {active && sort.direction === "desc" ? (
          <ArrowDown className="h-3.5 w-3.5" />
        ) : (
          <ArrowUp className="h-3.5 w-3.5" />
        )}
      </span>
    </button>
  );
}

/** F4: the expense table for one period. Read-only when the period is settled. */
export function ExpenseTable({
  expenses,
  members,
  sort,
  onSortChange,
  onEdit,
  onDelete,
  readOnly,
}: {
  expenses: Expense[];
  /** Needed to name the fronting member in the Prepaid column. */
  members: Member[];
  sort: ExpenseSort;
  onSortChange: (sort: ExpenseSort) => void;
  onEdit: (expense: Expense) => void;
  onDelete: (expense: Expense) => void;
  readOnly: boolean;
}) {
  const rows = useMemo(() => sortExpenses(expenses, sort), [expenses, sort]);

  function handleSort(key: ExpenseSortKey) {
    onSortChange(
      sort.key === key
        ? { key, direction: sort.direction === "asc" ? "desc" : "asc" }
        : { key, direction: "asc" },
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">
              <SortButton label="Date" column="date" sort={sort} onSort={handleSort} />
            </TableHead>
            <TableHead scope="col">
              <SortButton label="Name" column="name" sort={sort} onSort={handleSort} />
            </TableHead>
            <TableHead scope="col">Description</TableHead>
            <TableHead scope="col">Prepaid</TableHead>
            <TableHead scope="col">Mode of split</TableHead>
            <TableHead scope="col">
              <SortButton label="Amount" column="amount" sort={sort} onSort={handleSort} />
            </TableHead>
            <TableHead scope="col" className="w-12">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="h-28 text-center">
                <p className="font-medium">No expenses in this period</p>
                {/* A settled period has nothing to add, so the hint is dropped. */}
                {readOnly ? null : (
                  <p className="mt-1 text-sm text-muted-foreground">
                    Add one to see how it splits.
                  </p>
                )}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((expense) => (
              <TableRow key={expense.id} className="hover:bg-secondary/40">
                <TableCell>{format(parseISO(expense.date), "MMM d, yyyy")}</TableCell>
                <TableCell className="font-medium">
                  {readOnly ? (
                    expense.name
                  ) : (
                    <button
                      type="button"
                      className="text-left hover:underline"
                      onClick={() => onEdit(expense)}
                    >
                      {expense.name}
                    </button>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {expense.description || "—"}
                </TableCell>
                <TableCell>
                  {expense.isPrePaid ? (
                    <span className="text-positive">
                      Yes —{" "}
                      {(() => {
                        const fronting = members.find((m) => m.id === expense.paidBy);
                        return fronting && !fronting.archived
                          ? fronting.name
                          : "Removed member";
                      })()}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">
                      No <span className="text-xs">(from account)</span>
                    </span>
                  )}
                </TableCell>
                <TableCell>{MODE_LABEL[expense.splitMode]}</TableCell>
                <TableCell className="tnum">{formatMoney(expense.amountMinor)}</TableCell>
                <TableCell>
                  {readOnly ? null : (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Delete ${expense.name}`}
                      onClick={() => onDelete(expense)}
                      className="text-muted-foreground hover:text-negative"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

export { MODE_LABEL as EXPENSE_MODE_LABEL };
