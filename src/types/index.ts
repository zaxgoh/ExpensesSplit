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

/**
 * Households are keyed by the anonymous Firebase uid (§7 of PLAN.md). There is
 * no login, so `memberUids` is the entire access control list and must exist
 * from day one even though it always holds exactly one entry in v1 — the
 * join-link feature later depends on it.
 *
 * `memberIds` is a separate, append-only list of the household's member
 * document ids. It exists purely so the Firestore rules can answer "is this
 * participant a real member?" without a loop, which the rules language has no
 * way to express. It is never pruned: archiving a member leaves the id in place
 * so historical expenses stay referentially valid.
 */
export type Household = {
  id: string;
  name: string;
  /** Always exactly one entry in v1: the anonymous uid that created it. */
  memberUids: string[];
  /** Append-only list of member document ids, kept in step by the repository. */
  memberIds: string[];
  settings: HouseholdSettings;
  schemaVersion: number;
  createdAt: number;
  updatedAt: number;
};

export type HouseholdSettings = {
  defaultCategoryId: string;
};

export type Category = {
  id: string;
  label: string;
  icon: string;
  colorHex: string;
};

/**
 * A view-only share link (§7). The token is a 128-bit base64url bearer secret
 * and the document id: the share URL is `/share/{token}` and carries no
 * household id, which the token document resolves. Links never expire;
 * deleting the document revokes the link. `periodId` is the period the link
 * was created from — the visitor lands directly on it; null (old links)
 * lands on the shared period list instead.
 */
export type ShareLink = {
  token: string;
  householdId: string;
  periodId: string | null;
  createdAt: number;
  updatedAt: number;
};

export type StatusFilter = "all" | PeriodStatus;
