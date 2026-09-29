/**
 * The split engine. Pure functions, no React and no Firebase imports.
 *
 * The amounts returned here ARE the money each member owes into the household
 * account for that expense. The split and the transfer obligation are the same
 * number, not two separate calculations.
 *
 * There are exactly three modes. `equal` is the default.
 */

import type { MinorUnits } from "@/lib/money/minorUnits";

export const SPLIT_MODES = ["equal", "exact", "percent"] as const;
export type SplitMode = (typeof SPLIT_MODES)[number];

export const PERIOD_STATUSES = ["in_progress", "settled"] as const;
export type PeriodStatus = (typeof PERIOD_STATUSES)[number];

export const DEFAULT_SPLIT_MODE: SplitMode = "equal";

export type SplitEntry = {
  memberId: string;
  valueMinor: number | null; // exact mode
  percentBps: number | null; // percent mode, 1% = 100 bps
};

export type SplitResult = {
  shares: Record<string, MinorUnits>;
  /** Human-readable reason the split is invalid, or null when it is valid. */
  error: string | null;
};

export type ComputeSharesInput = {
  amountMinor: MinorUnits;
  mode: SplitMode;
  /** Ordered; also defines the order remainders are handed out in. */
  participants: string[];
  entries: SplitEntry[];
};

/** Equal split: base to everyone, remainder to the earliest participants. */
function computeEqual(amountMinor: MinorUnits, participants: string[]): Record<string, MinorUnits> {
  const n = participants.length;
  const base = Math.floor(amountMinor / n);
  const remainder = amountMinor - base * n;

  const shares: Record<string, MinorUnits> = {};
  participants.forEach((memberId, index) => {
    shares[memberId] = index < remainder ? base + 1 : base;
  });
  return shares;
}

/** Exact split: the author supplies every cent, so it either balances or not. */
function computeExact(
  amountMinor: MinorUnits,
  participants: string[],
  entries: SplitEntry[],
): SplitResult {
  const byMember = new Map(entries.map((entry) => [entry.memberId, entry.valueMinor]));

  const shares: Record<string, MinorUnits> = {};
  let assigned = 0;
  for (const memberId of participants) {
    const value = byMember.get(memberId) ?? 0;
    if (value < 0) return { shares: {}, error: "Shares cannot be negative." };
    shares[memberId] = value;
    assigned += value;
  }

  const delta = amountMinor - assigned;
  if (delta !== 0) {
    const formatted = formatDelta(delta);
    return {
      shares,
      error: delta > 0 ? `$${formatted} unassigned` : `over by $${formatDelta(-delta)}`,
    };
  }
  return { shares, error: null };
}

/**
 * Percent split: proportional amounts, then the rounding residual is handed out
 * by descending fractional part, ties broken by participant order.
 */
function computePercent(
  amountMinor: MinorUnits,
  participants: string[],
  entries: SplitEntry[],
): SplitResult {
  const byMember = new Map(entries.map((entry) => [entry.memberId, entry.percentBps]));

  const bps: number[] = [];
  let bpsTotal = 0;
  for (const memberId of participants) {
    const value = byMember.get(memberId) ?? 0;
    if (value < 0) return { shares: {}, error: "Percentages cannot be negative." };
    bps.push(value);
    bpsTotal += value;
  }

  if (bpsTotal !== 10000) {
    const deltaBps = 10000 - bpsTotal;
    return {
      shares: {},
      error:
        deltaBps > 0
          ? `${(deltaBps / 100).toFixed(2).replace(/\.?0+$/, "")}% unassigned`
          : `over by ${(-deltaBps / 100).toFixed(2).replace(/\.?0+$/, "")}%`,
    };
  }

  // Compute exact proportional amounts as rationals to avoid float drift when ranking.
  const shares: Record<string, MinorUnits> = {};
  const ranked: { index: number; remainder: number }[] = [];
  let assigned = 0;

  participants.forEach((memberId, index) => {
    const numerator = amountMinor * bps[index]; // / 10000
    const whole = Math.floor(numerator / 10000);
    shares[memberId] = whole;
    assigned += whole;
    ranked.push({ index, remainder: numerator - whole * 10000 });
  });

  // Hand the residual cents to the largest fractional parts first.
  const residual = amountMinor - assigned;
  ranked.sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (let i = 0; i < residual; i += 1) {
    const target = ranked[i % ranked.length];
    shares[participants[target.index]] += 1;
  }

  return { shares, error: null };
}

function formatDelta(cents: number): string {
  return (cents / 100).toFixed(2);
}

/**
 * Compute each participant's amount for one expense.
 * `sum(shares) === amountMinor` whenever `error` is null.
 */
export function computeShares(input: ComputeSharesInput): SplitResult {
  const { amountMinor, mode, participants } = input;

  if (amountMinor <= 0) return { shares: {}, error: "Amount must be greater than zero." };
  if (participants.length === 0) return { shares: {}, error: "Select at least one member." };

  switch (mode) {
    case "equal":
      return { shares: computeEqual(amountMinor, participants), error: null };
    case "exact":
      return computeExact(amountMinor, participants, input.entries);
    case "percent":
      return computePercent(amountMinor, participants, input.entries);
    default: {
      // Exhaustiveness guard: a fourth mode must never appear silently.
      const _never: never = mode;
      return { shares: {}, error: `Unsupported split mode: ${String(_never)}` };
    }
  }
}

/** Percentages expressed as basis points, for display in a form field. */
export function bpsToPercentString(bps: number): string {
  return (bps / 100).toFixed(2).replace(/\.?0+$/, "");
}

export function percentStringToBps(input: string): number | null {
  const trimmed = input.trim().replace(/%/g, "");
  if (trimmed === "" || !/^\d*\.?\d*$/.test(trimmed)) return null;
  if ((trimmed.split(".")[1] ?? "").length > 2) return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}
