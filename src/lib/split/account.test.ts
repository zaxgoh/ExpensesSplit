import { describe, expect, it } from "vitest";
import {
  assertFundingInvariant,
  computePeriodTotals,
  toSettledAmount,
} from "@/lib/split/account";
import {
  ceilWholeDollars,
  floorWholeDollars,
  formatMoney,
  formatMoneyWhole,
  parseMoneyToMinor,
} from "@/lib/money/minorUnits";
import { computeShares } from "@/lib/split/engine";
import type { Expense, Member } from "@/types";

const members: Member[] = [
  { id: "a", name: "Alex", avatar: "🦊", colorHex: "#fff", archived: false, createdAt: 0, updatedAt: 0 },
  { id: "b", name: "Sam", avatar: "🐼", colorHex: "#fff", archived: false, createdAt: 0, updatedAt: 0 },
  { id: "c", name: "Removed", avatar: "🐢", colorHex: "#fff", archived: true, createdAt: 0, updatedAt: 0 },
];

let seq = 0;
function expense(partial: Partial<Expense> & { amountMinor: number }): Expense {
  seq += 1;
  const participants = partial.participants ?? ["a", "b"];
  const sharesMinor =
    partial.sharesMinor ??
    computeShares({
      amountMinor: partial.amountMinor,
      mode: partial.splitMode ?? "equal",
      participants,
      entries: partial.splitEntries ?? [],
    }).shares;
  return {
    id: `e${seq}`,
    periodId: "p1",
    date: "2026-09-10",
    name: `Expense ${seq}`,
    description: "",
    isPrePaid: false,
    paidBy: null,
    categoryId: "other",
    splitMode: "equal",
    splitEntries: [],
    excluded: false,
    createdAt: 0,
    updatedAt: 0,
    ...partial,
    participants,
    sharesMinor,
  };
}

describe("settlement rounding", () => {
  it("rounds amounts owed UP to a whole dollar", () => {
    expect(toSettledAmount(40)).toBe(100); // $0.40 -> $1.00
    expect(toSettledAmount(100)).toBe(100); // $1.00 unchanged
    expect(toSettledAmount(101)).toBe(200);
    expect(toSettledAmount(999)).toBe(1000);
  });

  it("rounds reimbursements DOWN to a whole dollar", () => {
    expect(toSettledAmount(-4060)).toBe(-4000); // $40.60 -> $40.00
    expect(toSettledAmount(-4000)).toBe(-4000);
    expect(toSettledAmount(-1)).toBe(0); // $0.01 -> $0.00, not -$1.00
    expect(Object.is(toSettledAmount(-1), -0)).toBe(false);
  });

  it("keeps zero at zero", () => {
    expect(toSettledAmount(0)).toBe(0);
    expect(ceilWholeDollars(0)).toBe(0);
    expect(floorWholeDollars(0)).toBe(0);
  });

  it("never disadvantages the account in either direction", () => {
    // Owed amounts round up, so the member always pays at least the exact figure.
    expect(toSettledAmount(40)).toBeGreaterThanOrEqual(40);
    // Reimbursements round down in magnitude, so the account always pays at most
    // the exact figure. -4000 is the account paying LESS than the -4060 owed.
    expect(toSettledAmount(-4060)).toBeGreaterThanOrEqual(-4060);
    expect(Math.abs(toSettledAmount(-4060))).toBeLessThanOrEqual(Math.abs(-4060));
  });
});

describe("member balance against the account", () => {
  it("computes the worked example: consumed 300, fronted 120, owes 180", () => {
    // Alex split two expenses evenly with Sam.
    //   $120 grocery, prepaid by Alex  -> she consumed $60, fronted $120
    //   $480 utilities, from the account -> she consumed $240, fronted $0
    // Total: consumed $300, fronted $120, so she transfers $180 in.
    const totals = computePeriodTotals(
      [
        expense({
          amountMinor: 12000,
          isPrePaid: true,
          paidBy: "a",
          participants: ["a", "b"],
          sharesMinor: { a: 6000, b: 6000 },
        }),
        expense({
          amountMinor: 48000,
          participants: ["a", "b"],
          sharesMinor: { a: 24000, b: 24000 },
        }),
      ],
      members,
    );
    const alex = totals.transfers.find((t) => t.memberId === "a");
    expect(alex?.toAccountExact).toBe(18000);
    expect(alex?.toAccountSettled).toBe(18000);
  });

  it("nets a pre-paid member's fronting against what they consumed", () => {
    // $90 electricity, Alex fronted all of it, split three ways would be 30/30/30 but
    // here Alex and Sam only: Alex owes 45, having already paid 90, so she is owed 45.
    const totals = computePeriodTotals(
      [
        expense({
          amountMinor: 9000,
          isPrePaid: true,
          paidBy: "a",
          participants: ["a", "b"],
          sharesMinor: { a: 4500, b: 4500 },
        }),
      ],
      members,
    );
    const alex = totals.transfers.find((t) => t.memberId === "a")!;
    const sam = totals.transfers.find((t) => t.memberId === "b")!;
    expect(alex.toAccountExact).toBe(-4500);
    expect(alex.toAccountSettled).toBe(-4500);
    expect(sam.toAccountExact).toBe(4500);
    expect(sam.toAccountSettled).toBe(4500);
  });

  it("allows a pre-payer who is not a participant", () => {
    const totals = computePeriodTotals(
      [
        expense({
          amountMinor: 10000,
          isPrePaid: true,
          paidBy: "a",
          participants: ["b"],
          sharesMinor: { b: 10000 },
        }),
      ],
      members,
    );
    expect(totals.transfers.find((t) => t.memberId === "a")?.toAccountExact).toBe(-10000);
    expect(totals.transfers.find((t) => t.memberId === "b")?.toAccountExact).toBe(10000);
  });

  it("omits archived members from the transfer list", () => {
    const totals = computePeriodTotals(
      [expense({ amountMinor: 9000, participants: ["a", "c"], sharesMinor: { a: 4500, c: 4500 } })],
      members,
    );
    const ids = totals.transfers.map((t) => t.memberId);
    expect(ids).not.toContain("c");
    expect(ids).toContain("a");
  });

  it("ignores excluded expenses in both sums", () => {
    const totals = computePeriodTotals(
      [expense({ amountMinor: 10000, participants: ["a"], excluded: true, sharesMinor: { a: 10000 } })],
      members,
    );
    expect(totals.totalSpend).toBe(0);
    expect(totals.transfers[0].toAccountExact).toBe(0);
  });

  it("sorts transfers by magnitude descending", () => {
    const totals = computePeriodTotals(
      [
        expense({ amountMinor: 1000, participants: ["a", "b"], sharesMinor: { a: 100, b: 900 } }),
        expense({ amountMinor: 50000, participants: ["b"], sharesMinor: { b: 50000 } }),
      ],
      members,
    );
    expect(totals.transfers[0].memberId).toBe("b");
  });
});

describe("funding invariant", () => {
  it("sums the exact figures to totalSpend - totalPrePaid", () => {
    const expenses = [
      expense({ amountMinor: 60000, isPrePaid: true, paidBy: "a", sharesMinor: { a: 30000, b: 30000 } }),
      expense({ amountMinor: 12000, sharesMinor: { a: 6000, b: 6000 } }),
      expense({ amountMinor: 5000, participants: ["a"], sharesMinor: { a: 5000 } }),
    ];
    const totals = computePeriodTotals(expenses, members);
    expect(totals.totalSpend).toBe(77000);
    expect(totals.totalPrePaid).toBe(60000);
    expect(totals.fundingExact).toBe(17000);
    expect(() => assertFundingInvariant(totals)).not.toThrow();
  });

  it("holds when nothing was prepaid and when everything was", () => {
    const none = computePeriodTotals(
      [expense({ amountMinor: 10000, sharesMinor: { a: 5000, b: 5000 } })],
      members,
    );
    expect(none.fundingExact).toBe(10000);
    expect(() => assertFundingInvariant(none)).not.toThrow();

    const all = computePeriodTotals(
      [
        expense({
          amountMinor: 10000,
          isPrePaid: true,
          paidBy: "a",
          sharesMinor: { a: 5000, b: 5000 },
        }),
      ],
      members,
    );
    expect(all.fundingExact).toBe(0);
    expect(() => assertFundingInvariant(all)).not.toThrow();
  });

  it("rounds the funding line up to a whole dollar", () => {
    const totals = computePeriodTotals(
      [expense({ amountMinor: 10001, sharesMinor: { a: 5000, b: 5001 } })],
      members,
    );
    expect(totals.fundingExact).toBe(10001);
    expect(totals.fundingSettled).toBe(10100);
  });

  it("surfaces corrupted data rather than silently passing", () => {
    const totals = computePeriodTotals(
      [expense({ amountMinor: 10000, sharesMinor: { a: 10000, b: 0 } })],
      members,
    );
    // Sabotage the stored totals to simulate corruption.
    const broken = { ...totals, fundingExact: 999 };
    expect(() => assertFundingInvariant(broken)).toThrow(/invariant/i);
  });
});

describe("rounded totals may exceed exact totals, by design", () => {
  it("is asserted rather than corrected", () => {
    // $0.80 of an $0.80 expense split between Alex and Sam as $0.40 each.
    const totals = computePeriodTotals(
      [expense({ amountMinor: 80, sharesMinor: { a: 40, b: 40 } })],
      members,
    );
    const sumExact = totals.transfers.reduce((acc, t) => acc + t.toAccountExact, 0);
    const sumSettled = totals.transfers.reduce((acc, t) => acc + t.toAccountSettled, 0);
    expect(sumExact).toBe(80);
    // Each $0.40 rounds up to $1.00, so the settled sum is $2.00 for an $0.80 expense.
    expect(sumSettled).toBe(200);
    expect(sumSettled).toBeGreaterThan(sumExact);
  });
});

describe("money formatting", () => {
  it("formats with a leading $ and two decimals", () => {
    expect(formatMoney(123456)).toBe("$1,234.56");
    expect(formatMoney(0)).toBe("$0.00");
    expect(formatMoney(-4500)).toBe("-$45.00");
  });

  it("formats whole dollars without decimals", () => {
    expect(formatMoneyWhole(123500)).toBe("$1,235");
    expect(formatMoneyWhole(0)).toBe("$0");
    expect(formatMoneyWhole(-4000)).toBe("-$40");
  });

  it("parses input to cents and rejects more than two decimals", () => {
    expect(parseMoneyToMinor("12.30")).toBe(1230);
    expect(parseMoneyToMinor("$1,234.50")).toBe(123450);
    expect(parseMoneyToMinor("100")).toBe(10000);
    expect(parseMoneyToMinor("1.005")).toBeNull();
    expect(parseMoneyToMinor("abc")).toBeNull();
    expect(parseMoneyToMinor("")).toBeNull();
    expect(parseMoneyToMinor("-5")).toBeNull();
    expect(parseMoneyToMinor("0")).toBeNull();
  });
});
