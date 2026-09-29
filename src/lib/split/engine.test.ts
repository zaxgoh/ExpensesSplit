import { describe, expect, it } from "vitest";
import {
  computeShares,
  DEFAULT_SPLIT_MODE,
  SPLIT_MODES,
  percentStringToBps,
  type SplitEntry,
} from "@/lib/split/engine";

const p = (n: number): string => `m${n}`;

function sum(shares: Record<string, number>): number {
  return Object.values(shares).reduce((acc, v) => acc + v, 0);
}

describe("split mode surface", () => {
  it("offers exactly three modes with equal as the default", () => {
    expect(SPLIT_MODES).toEqual(["equal", "exact", "percent"]);
    expect(DEFAULT_SPLIT_MODE).toBe("equal");
  });
});

describe("equal mode (the default)", () => {
  it("divides evenly when the amount divides", () => {
    const { shares, error } = computeShares({
      amountMinor: 9000,
      mode: "equal",
      participants: [p(1), p(2), p(3)],
      entries: [],
    });
    expect(error).toBeNull();
    expect(shares).toEqual({ m1: 3000, m2: 3000, m3: 3000 });
  });

  it("always balances, including the 100/3 case", () => {
    const { shares, error } = computeShares({
      amountMinor: 10000,
      mode: "equal",
      participants: [p(1), p(2), p(3)],
      entries: [],
    });
    expect(error).toBeNull();
    expect(sum(shares)).toBe(10000);
    expect(shares.m1).toBe(3334);
    expect(shares.m3).toBe(3333);
  });

  it("handles 999/3 and a single member and two members", () => {
    for (const amount of [1, 99, 999, 9999]) {
      const three = computeShares({
        amountMinor: amount,
        mode: "equal",
        participants: [p(1), p(2), p(3)],
        entries: [],
      });
      expect(three.error).toBeNull();
      expect(sum(three.shares)).toBe(amount);
    }
    const one = computeShares({
      amountMinor: 4999,
      mode: "equal",
      participants: [p(1)],
      entries: [],
    });
    expect(one.shares.m1).toBe(4999);
    const two = computeShares({
      amountMinor: 5000,
      mode: "equal",
      participants: [p(1), p(2)],
      entries: [],
    });
    expect(two.shares).toEqual({ m1: 2500, m2: 2500 });
  });

  it("gives the extra cents to the earliest participants", () => {
    const { shares } = computeShares({
      amountMinor: 100,
      mode: "equal",
      participants: [p(1), p(2), p(3)],
      entries: [],
    });
    expect(shares).toEqual({ m1: 34, m2: 33, m3: 33 });
  });
});

describe("exact mode", () => {
  it("accepts shares that sum to the total", () => {
    const entries: SplitEntry[] = [
      { memberId: p(1), valueMinor: 3334, percentBps: null },
      { memberId: p(2), valueMinor: 3333, percentBps: null },
      { memberId: p(3), valueMinor: 3333, percentBps: null },
    ];
    const { shares, error } = computeShares({
      amountMinor: 10000,
      mode: "exact",
      participants: [p(1), p(2), p(3)],
      entries,
    });
    expect(error).toBeNull();
    expect(sum(shares)).toBe(10000);
  });

  it("reports unassigned and over-assigned deltas", () => {
    // $100.00 total, $90.00 assigned -> $10.00 unassigned.
    const under = computeShares({
      amountMinor: 10000,
      mode: "exact",
      participants: [p(1), p(2)],
      entries: [
        { memberId: p(1), valueMinor: 4000, percentBps: null },
        { memberId: p(2), valueMinor: 5000, percentBps: null },
      ],
    });
    expect(under.error).toBe("$10.00 unassigned");

    // $100.00 total, $110.00 assigned -> over by $10.00.
    const over = computeShares({
      amountMinor: 10000,
      mode: "exact",
      participants: [p(1), p(2)],
      entries: [
        { memberId: p(1), valueMinor: 6000, percentBps: null },
        { memberId: p(2), valueMinor: 5000, percentBps: null },
      ],
    });
    expect(over.error).toBe("over by $10.00");
  });
});

describe("percent mode", () => {
  it("splits 50/50 and balances", () => {
    const { shares, error } = computeShares({
      amountMinor: 10000,
      mode: "percent",
      participants: [p(1), p(2)],
      entries: [
        { memberId: p(1), valueMinor: null, percentBps: 5000 },
        { memberId: p(2), valueMinor: null, percentBps: 5000 },
      ],
    });
    expect(error).toBeNull();
    expect(shares).toEqual({ m1: 5000, m2: 5000 });
  });

  it("always balances for thirds", () => {
    const { shares, error } = computeShares({
      amountMinor: 10000,
      mode: "percent",
      participants: [p(1), p(2), p(3)],
      entries: [
        { memberId: p(1), valueMinor: null, percentBps: 3400 },
        { memberId: p(2), valueMinor: null, percentBps: 3300 },
        { memberId: p(3), valueMinor: null, percentBps: 3300 },
      ],
    });
    expect(error).toBeNull();
    expect(sum(shares)).toBe(10000);
  });

  it("requires percentages to total 10000 bps", () => {
    const { error } = computeShares({
      amountMinor: 10000,
      mode: "percent",
      participants: [p(1), p(2)],
      entries: [
        { memberId: p(1), valueMinor: null, percentBps: 4000 },
        { memberId: p(2), valueMinor: null, percentBps: 5000 },
      ],
    });
    expect(error).toBe("10% unassigned");
  });
});

describe("guards", () => {
  it("rejects a zero amount and no participants", () => {
    expect(
      computeShares({ amountMinor: 0, mode: "equal", participants: [p(1)], entries: [] }).error,
    ).toMatch(/greater than zero/);
    expect(
      computeShares({ amountMinor: 100, mode: "equal", participants: [], entries: [] }).error,
    ).toMatch(/at least one member/);
  });

  it("converts percent strings to basis points", () => {
    expect(percentStringToBps("50")).toBe(5000);
    expect(percentStringToBps("33.33")).toBe(3333);
    expect(percentStringToBps("")).toBeNull();
    expect(percentStringToBps("abc")).toBeNull();
    expect(percentStringToBps("1.234")).toBeNull();
  });
});
