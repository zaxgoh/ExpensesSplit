"use client";

import { useState } from "react";
import { Check, Copy, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useHousehold } from "@/components/layout/HouseholdProvider";
import { formatMoney, formatMoneyWhole } from "@/lib/money/minorUnits";
import type { PeriodTotals } from "@/lib/split/account";
import type { ExpensePeriod, Member } from "@/types";

/**
 * F6: the settlement card. Shows each member's transfer against the household
 * account, using the whole-dollar settled figures from PLAN.md section 4.
 * Sharing lives in the period page header (§7): this card keeps Copy all plus
 * Settle / Reopen, which render disabled on a view-only share page.
 */
export function TransferSummary({
  period,
  totals,
  members,
  onSettle,
  onReopen,
}: {
  period: ExpensePeriod;
  totals: PeriodTotals;
  members: Member[];
  onSettle: () => void;
  onReopen: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState<"settle" | "reopen" | null>(null);
  const { household, readOnly } = useHousehold();
  const settled = period.status === "settled";

  const nonZero = totals.transfers.filter((t) => t.toAccountExact !== 0);

  function summaryText(): string {
    const parts = totals.transfers
      .filter((t) => t.toAccountSettled !== 0)
      .map((t) =>
        t.toAccountSettled > 0
          ? `${t.memberName} → household account ${formatMoneyWhole(t.toAccountSettled)}`
          : `${t.memberName} ← household account ${formatMoneyWhole(-t.toAccountSettled)}`,
      );
    return `1ST split — ${period.name}: ${parts.join("; ")}.`;
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(summaryText());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="grid gap-4 rounded-lg border p-4">
      <header>
        <h2 className="text-lg font-medium">
          {household?.name ?? "Household account"} — {period.name}
        </h2>
        <p className="text-sm text-muted-foreground">
          Members transfer into the account. They never pay each other.
        </p>
      </header>

      <p className="rounded-lg bg-secondary/50 p-3 text-sm">
        The account must cover{" "}
        <strong className="tnum">{formatMoneyWhole(totals.fundingSettled)}</strong> of the{" "}
        <span className="tnum">{formatMoney(totals.totalSpend)}</span> spent in this period.
      </p>

      {nonZero.length === 0 ? (
        <p className="text-sm text-muted-foreground">All settled — nothing left to transfer.</p>
      ) : (
        <ul className="grid gap-2">
          {nonZero.map((transfer) => {
            const member = members.find((m) => m.id === transfer.memberId);
            const owes = transfer.toAccountSettled > 0;
            return (
              <li
                key={transfer.memberId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
              >
                <span className="flex items-center gap-2">
                  <span aria-hidden>{member?.avatar ?? "👤"}</span>
                  {transfer.memberName}
                </span>
                <span className="text-right">
                  <span
                    className={`tnum font-medium ${owes ? "text-positive" : "text-negative"}`}
                  >
                    {owes
                      ? `transfer ${formatMoneyWhole(transfer.toAccountSettled)} to the account`
                      : `reimbursed ${formatMoneyWhole(-transfer.toAccountSettled)} by the account`}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={copy} disabled={nonZero.length === 0}>
          {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
          {copied ? "Copied" : "Copy all"}
        </Button>

        {settled ? (
          <Button
            size="sm"
            onClick={() => setConfirming("reopen")}
            disabled={readOnly}
            title={readOnly ? "View-only link — reopening is disabled" : undefined}
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            Reopen period
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={() => setConfirming("settle")}
            disabled={readOnly}
            title={readOnly ? "View-only link — settling is disabled" : undefined}
          >
            <Check className="mr-2 h-4 w-4" />
            Settle period
          </Button>
        )}
      </div>

      {confirming ? (
        <div className="rounded-lg border border-warning/50 bg-warning/10 p-3 text-sm">
          <p>
            {confirming === "settle"
              ? "Settle this period? Its expenses become read-only. You can reopen it later."
              : "Reopen this period? Its expenses become editable again. Nothing is deleted."}
          </p>
          <div className="mt-2 flex gap-2">
            <Button
              size="sm"
              onClick={() => {
                if (confirming === "settle") onSettle();
                else onReopen();
                setConfirming(null);
              }}
            >
              {confirming === "settle" ? "Yes, settle" : "Yes, reopen"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setConfirming(null)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
