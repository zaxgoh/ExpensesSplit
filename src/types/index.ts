import type { MinorUnits } from "@/lib/money/minorUnits";
import type { PeriodStatus, SplitMode } from "@/lib/split/engine";

export type ISODate = string; // "YYYY-MM-DD"

export type Member = {
  id: string;
  name: string;
  avatar: string;
  colorHex: string;
  archived: boolean;
  createdAt: number;
  updatedAt: number;
};

export type ExpensePeriod = {
  id: string;
  name: string;
  startDate: ISODate;
  endDate: ISODate;
  status: PeriodStatus;
  /** Denormalised sum of non-excluded expense amounts. */
  totalAmountMinor: number;
  /** Denormalised count of non-excluded expenses. */
  expenseCount: number;
  settledAt: number | null;
  createdAt: number;
  updatedAt: number;
};

export type SplitEntry = {
  memberId: string;
  valueMinor: number | null;
  percentBps: number | null;
};

export type Expense = {
  id: string;
  periodId: string;
  date: ISODate;
  name: string;
  description: string;
  amountMinor: number;
  /** `isPrePaid === (paidBy !== null)` is an invariant. */
  isPrePaid: boolean;
  paidBy: string | null;
  categoryId: string;
  splitMode: SplitMode;
  participants: string[];
  splitEntries: SplitEntry[];
  /** sum(sharesMinor) === amountMinor. These are the members' transfers in. */
  sharesMinor: Record<string, MinorUnits>;
  excluded: boolean;
  createdAt: number;
  updatedAt: number;
};

export type Household = {
  id: string;
  name: string;
  schemaVersion: number;
  createdAt: number;
  updatedAt: number;
};

export type StatusFilter = "all" | PeriodStatus;
