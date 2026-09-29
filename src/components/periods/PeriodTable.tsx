"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CreatePeriodDialog } from "@/components/periods/lazyCreatePeriodDialog";
import { ConfirmDeleteDialog } from "@/components/periods/ConfirmDeleteDialog";
import { StatusBadge } from "@/components/periods/StatusBadge";
import { StatusFilter } from "@/components/periods/StatusFilter";
import { useHousehold } from "@/components/layout/HouseholdProvider";
import { formatMoney } from "@/lib/money/minorUnits";
import type { ExpensePeriod, ISODate, StatusFilter as StatusFilterValue } from "@/types";

/**
 * F2: the home page. The period table is always rendered, with a status filter
 * above it and default sort of startDate ascending. Zero periods shows an empty
 * state, with the create button still visible in the header.
 */
export function PeriodTable() {
  const { repository, ready } = useHousehold();
  const [periods, setPeriods] = useState<ExpensePeriod[]>([]);
  const [filter, setFilter] = useState<StatusFilterValue>("all");
  const [descending, setDescending] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState<ExpensePeriod | null>(null);

  const reload = useCallback(async () => {
    setPeriods(await repository.listPeriods());
  }, [repository]);

  useEffect(() => {
    if (ready) void reload();
  }, [ready, reload]);

  const visible = useMemo(() => {
    const filtered = filter === "all" ? periods : periods.filter((p) => p.status === filter);
    return [...filtered].sort((a, b) => {
      const delta = a.startDate.localeCompare(b.startDate);
      return descending ? -delta : delta;
    });
  }, [periods, filter, descending]);

  async function handleCreate(input: { name: string; startDate: ISODate; endDate: ISODate }) {
    await repository.createPeriod(input);
    await reload();
  }

  async function handleDelete(period: ExpensePeriod) {
    await repository.deletePeriod(period.id);
    setDeleting(null);
    await reload();
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Expense periods</h1>
          <p className="text-sm text-muted-foreground">
            Each period holds its own expenses and settles independently.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" aria-hidden />
            Create expense period
          </Button>
        </div>
      </div>

      <StatusFilter value={filter} onChange={setFilter} periods={periods} />

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Name</TableHead>
              <TableHead scope="col">
                <button
                  type="button"
                  className="inline-flex items-center gap-1 hover:text-foreground"
                  onClick={() => setDescending((value) => !value)}
                  aria-label="Sort by start date"
                >
                  Start date
                  <span aria-hidden className="text-muted-foreground">
                    {descending ? "↓" : "↑"}
                  </span>
                </button>
              </TableHead>
              <TableHead scope="col">End date</TableHead>
              <TableHead scope="col">
                <button
                  type="button"
                  className="inline-flex items-center gap-1 hover:text-foreground"
                  onClick={() => setDescending((value) => !value)}
                  aria-label="Sort by total expense amount"
                >
                  Total expense amount
                  <span aria-hidden className="text-muted-foreground">
                    {descending ? "↓" : "↑"}
                  </span>
                </button>
              </TableHead>
              <TableHead scope="col">Status</TableHead>
              <TableHead scope="col" className="w-12">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center">
                  <p className="font-medium">No expense periods yet</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Create one to start recording expenses.
                  </p>
                </TableCell>
              </TableRow>
            ) : (
              visible.map((period) => (
                <TableRow key={period.id} className="hover:bg-secondary/40">
                  <TableCell className="font-medium">
                    <Link
                      href={`/period/${period.id}`}
                      className="hover:underline focus-visible:underline"
                    >
                      {period.name}
                    </Link>
                  </TableCell>
                  <TableCell>{format(parseISO(period.startDate), "MMM d, yyyy")}</TableCell>
                  <TableCell>{format(parseISO(period.endDate), "MMM d, yyyy")}</TableCell>
                  <TableCell className="tnum">
                    {formatMoney(period.totalAmountMinor)}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={period.status} />
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Delete ${period.name}`}
                      onClick={() => setDeleting(period)}
                      className="text-muted-foreground hover:text-negative"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <CreatePeriodDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreate={handleCreate}
        existingNames={periods.map((p) => p.name)}
      />

      <ConfirmDeleteDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title={`Delete "${deleting?.name ?? ""}"?`}
        description={
          deleting && deleting.expenseCount > 0
            ? `This permanently removes the period and the ${deleting.expenseCount} ${
                deleting.expenseCount === 1 ? "expense" : "expenses"
              } inside it. This cannot be undone.`
            : "This permanently removes the period. This cannot be undone."
        }
        confirmLabel="Delete period"
        onConfirm={() => {
          if (deleting) return handleDelete(deleting);
        }}
      />
    </div>
  );
}
