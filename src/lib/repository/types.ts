/**
 * Repository interface. The app talks to this, never to storage or the Firebase
 * SDK directly, so the Firestore implementation can be swapped in without
 * touching a component. Every method is async to match the Firestore shape.
 *
 * Two kinds of method, deliberately both on one interface:
 *
 *  - `get*` / `create*` / `update*` / `delete*` are one-shot promises. They
 *    cover writes and the tests' setup.
 *
 *  - `subscribe*` are realtime listeners. The localStorage implementation
 *    satisfies them by emitting once and returning a no-op; the Firestore one
 *    wires them to `onSnapshot`. PLAN.md §5 requires realtime, and putting it
 *    on the same seam keeps there being exactly one seam.
 */

import type { Category, Expense, ExpensePeriod, Household, Member, ShareLink } from "@/types";

export type CreateExpenseInput = Omit<Expense, "id" | "createdAt" | "updatedAt">;
export type CreatePeriodInput = Omit<
  ExpensePeriod,
  "id" | "status" | "totalAmountMinor" | "expenseCount" | "settledAt" | "createdAt" | "updatedAt"
>;

export type Unsubscribe = () => void;

/** Called with the current collection contents, then again on every change. */
export type WatchHandler<T> = (items: T[]) => void;
export type WatchErrorHandler = (error: Error) => void;

export type Repository = {
  getHousehold(): Promise<Household | null>;
  createHousehold(name: string): Promise<Household>;

  listMembers(): Promise<Member[]>;
  createMember(name: string, avatar?: string): Promise<Member>;
  updateMember(id: string, patch: Partial<Member>): Promise<void>;
  archiveMember(id: string): Promise<void>;

  listPeriods(): Promise<ExpensePeriod[]>;
  createPeriod(input: CreatePeriodInput): Promise<ExpensePeriod>;
  updatePeriod(id: string, patch: Partial<ExpensePeriod>): Promise<void>;
  deletePeriod(id: string): Promise<void>;

  listExpenses(periodId: string): Promise<Expense[]>;
  createExpense(input: CreateExpenseInput): Promise<Expense>;
  updateExpense(id: string, periodId: string, patch: Partial<Expense>): Promise<void>;
  deleteExpense(id: string, periodId: string): Promise<void>;

  /**
   * View-only share links (§7). Tokens are bearer secrets: `resolveShareLink`
   * needs no household context because the token document carries the
   * household id. Links never expire; deleting one revokes it.
   */
  createShareLink(): Promise<ShareLink>;
  listShareLinks(): Promise<ShareLink[]>;
  resolveShareLink(token: string): Promise<ShareLink | null>;
  deleteShareLink(token: string): Promise<void>;

  subscribeHousehold(
    onNext: (household: Household | null) => void,
    onError?: WatchErrorHandler,
  ): Unsubscribe;
  subscribeMembers(onNext: WatchHandler<Member>, onError?: WatchErrorHandler): Unsubscribe;
  subscribePeriods(onNext: WatchHandler<ExpensePeriod>, onError?: WatchErrorHandler): Unsubscribe;
  subscribeCategories(onNext: WatchHandler<Category>, onError?: WatchErrorHandler): Unsubscribe;
  subscribeExpenses(
    periodId: string,
    onNext: WatchHandler<Expense>,
    onError?: WatchErrorHandler,
  ): Unsubscribe;
};
