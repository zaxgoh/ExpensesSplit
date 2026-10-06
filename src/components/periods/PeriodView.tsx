"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { ArrowLeft, Plus, Trash2, UserPlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ExpenseTable,
  type ExpenseSort,
} from "@/components/expenses/ExpenseTable";
import {
  /**
   * The add/edit form is the heaviest thing on this page: it pulls in the calendar
   * (react-day-picker) plus Select, Checkbox and Switch. It is only needed once the
   * user asks for it, so it loads on demand. In the static graph the period page
   * shipped far more JS than it needed to just render a table.
   */
  AddExpenseForm,
} from "@/components/expenses/lazyAddExpenseForm";
import { StatusBadge } from "@/components/periods/StatusBadge";
import { InlinePeriodName } from "@/components/periods/InlinePeriodName";
import { ConfirmDeleteDialog } from "@/components/periods/ConfirmDeleteDialog";
import { AddMemberDialog } from "@/components/members/AddMemberDialog";
import { TransferSummary } from "@/components/settlement/TransferSummary";
import { useHousehold } from "@/components/layout/HouseholdProvider";
import { formatMoney } from "@/lib/money/minorUnits";
import {
  assertFundingInvariant,
  computePeriodTotals,
  type PeriodTotals,
} from "@/lib/split/account";
import type { Expense, SplitEntry } from "@/types";

/** F4, F5, F6: one expense period — its expenses, the add form, and settlement. */
export function PeriodView({ periodId }: { periodId: string }) {
  const { repository, members, periods, ready, reloadPeriods } = useHousehold();
  const router = useRouter();

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [memberDialogOpen, setMemberDialogOpen] = useState(false);
  const [sort, setSort] = useState<ExpenseSort>({ key: "date", direction: "asc" });
  const [deletingExpense, setDeletingExpense] = useState<Expense | null>(null);
  const [deletingPeriod, setDeletingPeriod] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const period = useMemo(
    () => periods.find((p) => p.id === periodId) ?? null,
    [periods, periodId],
  );
  // Kept for the duplicate-name check when renaming.
  const siblingNames = useMemo(
    () => periods.filter((p) => p.id !== periodId).map((p) => p.name),
    [periods, periodId],
  );

  // Expenses are their own realtime subscription: §3 puts them in a subcollection
  // of the period, so this is the one query that opens a period.
  useEffect(() => repository.subscribeExpenses(periodId, setExpenses), [repository, periodId]);

  /**
   * Re-reads after a write so the screen is correct even on the localStorage
   * repository, which has no listener to push the change back.
   */
  const reload = useCallback(async () => {
    setExpenses(await repository.listExpenses(periodId));
    await reloadPeriods();
  }, [repository, periodId, reloadPeriods]);

  const totals = useMemo(
    () => (period ? computePeriodTotals(expenses, members) : null),
    [expenses, members, period],
  );

  if (!ready) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  if (!period) {
    return (
      <div className="grid gap-3">
        <p>That expense period could not be found.</p>
        <Link href="/" className="text-accent hover:underline">
          Back to expense periods
        </Link>
      </div>
    );
  }

  const settled = period.status === "settled";

  /**
   * Every mutation goes through here so a rejected write — a settled period, a
   * date outside the period, a lost connection — surfaces as a message instead
   * of an unhandled rejection.
   */
  async function run(action: () => Promise<void>) {
    try {
      setActionError(null);
      await action();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "That change could not be saved.");
    }
  }

  async function handleSubmit(input: {
    date: string;
    name: string;
    description: string;
    amountMinor: number;
    isPrePaid: boolean;
    paidBy: string | null;
    splitMode: string;
    participants: string[];
    splitEntries: SplitEntry[];
    sharesMinor: Record<string, number>;
  }) {
    await run(async () => {
      if (editing) {
        await repository.updateExpense(editing.id, periodId, input as Partial<Expense>);
      } else {
        await repository.createExpense({
          ...input,
          periodId,
          categoryId: "other",
          excluded: false,
        } as never);
      }
      setFormOpen(false);
      setEditing(null);
      await reload();
    });
  }

  async function setStatus(status: "in_progress" | "settled") {
    await run(async () => {
      await repository.updatePeriod(periodId, {
        status,
        settledAt: status === "settled" ? Date.now() : null,
      });
      await reload();
    });
  }

  async function renamePeriod(next: string) {
    await run(async () => {
      await repository.updatePeriod(periodId, { name: next });
      await reload();
    });
  }

  async function deleteExpense(expense: Expense) {
    await run(async () => {
      await repository.deleteExpense(expense.id, periodId);
      setDeletingExpense(null);
      await reload();
    });
  }

  async function deletePeriod() {
    await run(async () => {
      await repository.deletePeriod(periodId);
      router.push("/");
    });
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            All expense periods
          </Link>
          <h1 className="mt-1 flex flex-wrap items-center gap-3 text-2xl font-semibold tracking-tight">
            <InlinePeriodName
              name={period.name}
              existingNames={siblingNames}
              disabled={settled}
              onRename={renamePeriod}
            />
            <StatusBadge status={period.status} />
          </h1>
          <p className="text-sm text-muted-foreground tnum">
            {format(parseISO(period.startDate), "MMM d, yyyy")} –{" "}
            {format(parseISO(period.endDate), "MMM d, yyyy")} ·{" "}
            {formatMoney(period.totalAmountMinor)} total · {period.expenseCount}{" "}
            {period.expenseCount === 1 ? "expense" : "expenses"}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {settled ? (
            <Button variant="outline" onClick={() => void setStatus("in_progress")}>
              Reopen period
            </Button>
          ) : (
            <>
              <Button
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
              >
                <Plus className="mr-2 h-4 w-4" aria-hidden />
                Add expense
              </Button>
              <Button variant="outline" onClick={() => setMemberDialogOpen(true)}>
                <UserPlus className="mr-2 h-4 w-4" aria-hidden />
                Add member
              </Button>
            </>
          )}
          <Button
            variant="outline"
            onClick={() => setDeletingPeriod(true)}
            className="text-muted-foreground hover:text-negative"
            // F8: delete controls are hidden while a period is settled, and the
            // Firestore rules enforce the same thing — a settled period's
            // expenses cannot be deleted, so its cascade delete cannot run.
            disabled={settled}
          >
            <Trash2 className="mr-2 h-4 w-4" aria-hidden />
            Delete period
          </Button>
        </div>
      </div>

      {actionError ? (
        <p role="alert" className="rounded-lg border border-negative/40 bg-negative/10 p-3 text-sm">
          {actionError}
        </p>
      ) : null}

      {settled ? (
        <div className="grid gap-6">
          {totals ? (
            <TransferSummary
              period={period}
              totals={totals}
              members={members}
              onSettle={() => void setStatus("settled")}
              onReopen={() => void setStatus("in_progress")}
            />
          ) : null}

          <section className="grid gap-3">
            <h2 className="text-lg font-medium">Expenses</h2>
            <ExpenseTable
              expenses={expenses}
              members={members}
              sort={sort}
              onSortChange={setSort}
              onEdit={(expense) => {
                setEditing(expense);
                setFormOpen(true);
              }}
              onDelete={(expense) => setDeletingExpense(expense)}
              readOnly
            />
          </section>
        </div>
      ) : (
        <Tabs defaultValue="expenses">
          <TabsList aria-label="Period sections">
            <TabsTrigger value="expenses">Expenses</TabsTrigger>
            <TabsTrigger value="settlement">Settlement</TabsTrigger>
          </TabsList>

          <TabsContent value="expenses" className="mt-4">
            {formOpen ? (
              <div className="mb-4 rounded-lg border p-4">
                <h2 className="mb-3 text-lg font-medium">
                  {editing ? "Edit expense" : "Add expense"}
                </h2>
                <AddExpenseForm
                  period={period}
                  members={members}
                  initial={editing}
                  onSubmit={handleSubmit}
                  onCancel={() => {
                    setFormOpen(false);
                    setEditing(null);
                  }}
                />
              </div>
            ) : null}

            <ExpenseTable
              expenses={expenses}
              members={members}
              sort={sort}
              onSortChange={setSort}
              onEdit={(expense) => {
                setEditing(expense);
                setFormOpen(true);
              }}
              onDelete={(expense) => setDeletingExpense(expense)}
              readOnly={settled}
            />
          </TabsContent>

          <TabsContent value="settlement" className="mt-4">
            {totals ? (
              <TransferSummary
                period={period}
                totals={totals}
                members={members}
                onSettle={() => void setStatus("settled")}
                onReopen={() => void setStatus("in_progress")}
              />
            ) : null}
          </TabsContent>
        </Tabs>
      )}

      {totals ? <InvariantProbe totals={totals} /> : null}

      <AddMemberDialog open={memberDialogOpen} onOpenChange={setMemberDialogOpen} />

      <ConfirmDeleteDialog
        open={deletingExpense !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingExpense(null);
        }}
        title={`Delete "${deletingExpense?.name ?? ""}"?`}
        description={
          deletingExpense
            ? `This permanently removes the ${formatMoney(
                deletingExpense.amountMinor,
              )} expense. This cannot be undone.`
            : ""
        }
        onConfirm={() => {
          if (deletingExpense) return deleteExpense(deletingExpense);
        }}
      />

      <ConfirmDeleteDialog
        open={deletingPeriod}
        onOpenChange={setDeletingPeriod}
        title={`Delete "${period.name}"?`}
        description={
          expenses.length === 0
            ? "This permanently removes the period. This cannot be undone."
            : `This permanently removes the period and the ${expenses.length} ${
                expenses.length === 1 ? "expense" : "expenses"
              } inside it. This cannot be undone.`
        }
        confirmLabel="Delete period"
        onConfirm={deletePeriod}
      />
    </div>
  );
}

/** Surfaces the funding invariant without breaking the render if data is corrupt. */
function InvariantProbe({ totals }: { totals: PeriodTotals }) {
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let next: string | null = null;
    try {
      assertFundingInvariant(totals);
    } catch (err) {
      next = err instanceof Error ? err.message : "invariant failed";
    }
    // Only write state when it actually changed; setting null on every totals
    // change would schedule an extra render pass each time the user edits.
    setError((current) => (current === next ? current : next));
  }, [totals]);
  if (!error) return null;
  return (
    <p role="alert" className="rounded-lg border border-negative/50 bg-negative/10 p-3 text-sm">
      {error}
    </p>
  );
}
