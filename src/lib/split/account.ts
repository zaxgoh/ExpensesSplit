/**
 * Member balance against the household account, and the end-of-period
 * settlement rounding. Pure functions, no React and no Firebase imports.
 */

import { ceilWholeDollars, floorWholeDollars, type MinorUnits } from "@/lib/money/minorUnits";
import type { Expense, Member } from "@/types";

export type MemberTransfer = {
  memberId: string;
  memberName: string;
  /** Exact figure in cents: consumed minus fronted. */
  toAccountExact: MinorUnits;
  /** Whole-dollar figure used for settlement. */
  toAccountSettled: MinorUnits;
};

export type PeriodTotals = {
  totalSpend: MinorUnits;
  totalPrePaid: MinorUnits;
  /** What the household account must fund from its own money. */
  fundingExact: MinorUnits;
  /** Same, ceiled to whole dollars for display. */
  fundingSettled: MinorUnits;
  transfers: MemberTransfer[];
};

/**
 * Apply the settlement rounding rule: amounts the member owes are rounded UP,
 * amounts the account owes the member are rounded DOWN. The account is never
 * disadvantaged in either direction.
 */
export function toSettledAmount(exact: MinorUnits): MinorUnits {
  if (exact > 0) return ceilWholeDollars(exact);
  if (exact < 0) return floorWholeDollars(exact);
  return 0;
}

/**
 * Rounding is applied per member, independently, so the settled figures will
 * generally exceed the exact total by up to (n - 1) whole dollars. That is
 * intentional and must not be "corrected" by altering any member's share.
 */
export function computePeriodTotals(expenses: Expense[], members: Member[]): PeriodTotals {
  const live = expenses.filter((expense) => !expense.excluded);

  const netConsumed: Record<string, number> = {};
  const netFronted: Record<string, number> = {};
  const bump = (map: Record<string, number>, key: string, by: number) => {
    map[key] = (map[key] ?? 0) + by;
  };

  let totalSpend = 0;
  let totalPrePaid = 0;

  for (const expense of live) {
    totalSpend += expense.amountMinor;
    if (expense.isPrePaid && expense.paidBy) {
      totalPrePaid += expense.amountMinor;
      bump(netFronted, expense.paidBy, expense.amountMinor);
    }
    for (const memberId of expense.participants) {
      bump(netConsumed, memberId, expense.sharesMinor[memberId] ?? 0);
    }
  }

  const transfers: MemberTransfer[] = members
    .filter((member) => !member.archived)
    .map((member) => {
      const toAccountExact = (netConsumed[member.id] ?? 0) - (netFronted[member.id] ?? 0);
      return {
        memberId: member.id,
        memberName: member.name,
        toAccountExact,
        toAccountSettled: toSettledAmount(toAccountExact),
      };
    })
    .sort(
      (a, b) =>
        Math.abs(b.toAccountExact) - Math.abs(a.toAccountExact) ||
        a.memberName.localeCompare(b.memberName),
    );

  const fundingExact = totalSpend - totalPrePaid;

  return {
    totalSpend,
    totalPrePaid,
    fundingExact,
    fundingSettled: toSettledAmount(fundingExact),
    transfers,
  };
}

/**
 * Development-only assertion. Applies to the EXACT figures only: the rounded
 * figures intentionally do not sum back to the same total.
 */
export function assertFundingInvariant(totals: PeriodTotals): void {
  const sumExact = totals.transfers.reduce((acc, t) => acc + t.toAccountExact, 0);
  if (sumExact !== totals.fundingExact) {
    throw new Error(
      `Funding invariant violated: sum of member figures (${sumExact}) !== ` +
        `totalSpend - totalPrePaid (${totals.fundingExact}). Data is corrupt.`,
    );
  }
}
