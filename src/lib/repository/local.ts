/**
 * localStorage-backed repository. Stands in for Firestore until the backend is
 * built. Every write keeps the parent period's denormalised totals consistent,
 * mirroring the batched write the Firestore implementation will do.
 */

import type {
  CreateExpenseInput,
  CreatePeriodInput,
  Repository,
  Unsubscribe,
  WatchErrorHandler,
} from "@/lib/repository/types";
import type { Category, Expense, ExpensePeriod, Household, Member, ShareLink } from "@/types";
import { DEFAULT_CATEGORIES } from "@/lib/firebase/paths";
import { AVATARS } from "@/lib/members/avatars";

const KEYS = {
  household: "1stsplit:household",
  members: "1stsplit:members",
  periods: "1stsplit:periods",
  expenses: "1stsplit:expenses",
  categories: "1stsplit:categories",
  shareLinks: "1stsplit:shareLinks",
  theme: "1stsplit:theme",
  lastPeriodId: "1stsplit:lastPeriodId",
} as const;

const PALETTE = [
  "#F87171",
  "#FB923C",
  "#FBBF24",
  "#4ADE80",
  "#34D399",
  "#22D3EE",
  "#60A5FA",
  "#818CF8",
  "#C084FC",
  "#F472B6",
];

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable (private mode). The app degrades to in-memory only.
  }
}

/** Links written before `periodId` existed land on the list (null). */
function normalizeShareLink(link: ShareLink): ShareLink {
  return { ...link, periodId: link.periodId ?? null };
}

function uid(): string {  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `id-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

/** 128-bit base64url bearer secret, mirroring `newJoinSecret` in firebase/client. */
function newToken(): string {
  try {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    let binary = "";
    bytes.forEach((b) => {
      binary += String.fromCharCode(b);
    });
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  } catch {
    return uid();
  }
}

/** Stable colour per member so a member keeps their colour across reloads. */
function colorFor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

function assertOpen(period: ExpensePeriod | undefined, action: string): ExpensePeriod {
  if (!period) throw new Error(`Expense period not found.`);
  if (period.status === "settled") {
    throw new Error(`Cannot ${action} in a settled expense period. Reopen it first.`);
  }
  return period;
}

function allExpenses(): Expense[] {
  return read<Expense[]>(KEYS.expenses, []);
}
function saveExpenses(expenses: Expense[]): void {
  write(KEYS.expenses, expenses);
}

function allPeriods(): ExpensePeriod[] {
  return read<ExpensePeriod[]>(KEYS.periods, []);
}

function savePeriods(periods: ExpensePeriod[]): void {
  write(KEYS.periods, periods);
}

/** Recompute a period's denormalised total and count from its expenses. */
function recalcPeriod(periods: ExpensePeriod[], periodId: string): void {
  const period = periods.find((p) => p.id === periodId);
  if (!period) return;
  const live = allExpenses().filter((e) => e.periodId === periodId && !e.excluded);
  period.totalAmountMinor = live.reduce((acc, e) => acc + e.amountMinor, 0);
  period.expenseCount = live.length;
  period.updatedAt = Date.now();
}

function touchPeriod(periodId: string): void {
  const periods = allPeriods();
  recalcPeriod(periods, periodId);
  savePeriods(periods);
}

export const localRepository: Repository = {
  async getHousehold() {
    return read<Household | null>(KEYS.household, null);
  },

  async createHousehold(name) {
    const now = Date.now();
    const id = uid();
    const household: Household = {
      id,
      name: name.trim(),
      // Stands in for the anonymous Firebase uid, which is what this id is in
      // the Firestore build. Always exactly one entry in v1.
      memberUids: [id],
      // Append-only, exactly as Firestore's rules require: a member document
      // may only exist once its id is registered here.
      memberIds: [],
      settings: { defaultCategoryId: "other" },
      schemaVersion: 1,
      createdAt: now,
      updatedAt: now,
    };
    write(KEYS.household, household);
    write(KEYS.categories, DEFAULT_CATEGORIES.map((c) => ({ ...c })));
    return household;
  },

  async listMembers() {
    return read<Member[]>(KEYS.members, []);
  },

  async createMember(name, avatar) {
    const members = read<Member[]>(KEYS.members, []);
    const now = Date.now();
    const id = uid();
    const member: Member = {
      id,
      name: name.trim(),
      avatar: avatar && avatar.length > 0 ? avatar : AVATARS[members.length % AVATARS.length],
      colorHex: "",
      archived: false,
      createdAt: now,
      updatedAt: now,
    };
    member.colorHex = colorFor(member.id);
    members.push(member);
    write(KEYS.members, members);

    const household = read<Household | null>(KEYS.household, null);
    if (household) {
      // Never pruned: an archived member's id has to stay resolvable so the
      // historical expenses that reference them remain valid.
      write(KEYS.household, { ...household, memberIds: [...household.memberIds, id] });
    }
    return member;
  },

  async updateMember(id, patch) {
    const members = read<Member[]>(KEYS.members, []);
    const index = members.findIndex((m) => m.id === id);
    if (index === -1) return;
    members[index] = { ...members[index], ...patch, updatedAt: Date.now() };
    write(KEYS.members, members);
  },

  async archiveMember(id) {
    await this.updateMember(id, { archived: true });
  },

  async listPeriods() {
    return allPeriods();
  },

  async createPeriod(input: CreatePeriodInput) {
    const now = Date.now();
    const period: ExpensePeriod = {
      ...input,
      id: uid(),
      name: input.name.trim(),
      status: "in_progress",
      totalAmountMinor: 0,
      expenseCount: 0,
      settledAt: null,
      createdAt: now,
      updatedAt: now,
    };
    const periods = allPeriods();
    periods.push(period);
    savePeriods(periods);
    return period;
  },

  async updatePeriod(id, patch) {
    const periods = allPeriods();
    const index = periods.findIndex((p) => p.id === id);
    if (index === -1) return;
    periods[index] = { ...periods[index], ...patch, updatedAt: Date.now() };
    savePeriods(periods);
  },

  async deletePeriod(id) {
    // Mirrors the Firestore rule that deletes lock: a settled period must be
    // reopened first. The local repository is the only backstop in Phase 1, so
    // it has to agree with what the rules will later enforce.
    assertOpen(allPeriods().find((p) => p.id === id), "delete a period");
    saveExpenses(allExpenses().filter((e) => e.periodId !== id));
    savePeriods(allPeriods().filter((p) => p.id !== id));
  },

  async listExpenses(periodId) {
    return allExpenses().filter((e) => e.periodId === periodId);
  },

  async createExpense(input: CreateExpenseInput) {
    const periods = allPeriods();
    const parent = assertOpen(
      periods.find((p) => p.id === input.periodId),
      "add an expense",
    );

    // Mirrors the Firestore rule: an expense's date must fall within its period.
    if (input.date < parent.startDate || input.date > parent.endDate) {
      throw new Error(
        `Expense date ${input.date} falls outside the period ` +
          `(${parent.startDate} to ${parent.endDate}).`,
      );
    }

    const now = Date.now();
    const expense: Expense = { ...input, id: uid(), createdAt: now, updatedAt: now };
    const expenses = allExpenses();
    expenses.push(expense);
    saveExpenses(expenses);
    touchPeriod(input.periodId);
    return expense;
  },

  async updateExpense(id, periodId, patch) {
    const periods = allPeriods();
    const parent = assertOpen(
      periods.find((p) => p.id === periodId),
      "edit an expense",
    );

    const expenses = allExpenses();
    const index = expenses.findIndex((e) => e.id === id);
    if (index === -1) return;

    if (patch.date && (patch.date < parent.startDate || patch.date > parent.endDate)) {
      throw new Error(
        `Expense date ${patch.date} falls outside the period ` +
          `(${parent.startDate} to ${parent.endDate}).`,
      );
    }

    expenses[index] = { ...expenses[index], ...patch, updatedAt: Date.now() };
    saveExpenses(expenses);
    touchPeriod(periodId);
  },

  async deleteExpense(id, periodId) {
    const periods = allPeriods();
    assertOpen(periods.find((p) => p.id === periodId), "delete an expense");

    saveExpenses(allExpenses().filter((e) => e.id !== id));
    touchPeriod(periodId);
  },

  // -------------------------------------------------------------- share links

  async createShareLink(periodId: string | null) {
    const household = read<Household | null>(KEYS.household, null);
    if (!household) throw new Error("Create a household before sharing it.");
    const now = Date.now();
    const link: ShareLink = {
      token: newToken(),
      householdId: household.id,
      periodId,
      createdAt: now,
      updatedAt: now,
    };
    const links = read<ShareLink[]>(KEYS.shareLinks, []);
    links.push(link);
    write(KEYS.shareLinks, links);
    return link;
  },

  async listShareLinks() {
    return [...read<ShareLink[]>(KEYS.shareLinks, [])]
      .map(normalizeShareLink)
      .sort((a, b) => b.createdAt - a.createdAt);
  },

  async resolveShareLink(token) {
    const found = read<ShareLink[]>(KEYS.shareLinks, []).find((link) => link.token === token);
    return found ? normalizeShareLink(found) : null;
  },

  async deleteShareLink(token) {
    write(
      KEYS.shareLinks,
      read<ShareLink[]>(KEYS.shareLinks, []).filter((link) => link.token !== token),
    );
  },

  // ---------------------------------------------------------------- realtime
  //
  // localStorage has no listener, so each of these emits the current contents
  // once and returns a no-op unsubscribe. Callers that mutate data re-read it
  // explicitly (HouseholdProvider's reload helpers), which is what keeps the
  // UI immediate here; the Firestore repository is the one that pushes.

  subscribeHousehold(onNext, onError) {
    return emit(() => void localRepository.getHousehold().then(onNext).catch(report(onError)));
  },

  subscribeMembers(onNext, onError) {
    return emit(() => void localRepository.listMembers().then(onNext).catch(report(onError)));
  },

  subscribePeriods(onNext, onError) {
    return emit(() => void localRepository.listPeriods().then(onNext).catch(report(onError)));
  },

  subscribeCategories(onNext, onError) {
    return emit(() =>
      void Promise.resolve()
        .then(() => read<Category[]>(KEYS.categories, DEFAULT_CATEGORIES.map((c) => ({ ...c }))))
        .then(onNext)
        .catch(report(onError)),
    );
  },

  subscribeExpenses(periodId, onNext, onError) {
    return emit(() =>
      void localRepository.listExpenses(periodId).then(onNext).catch(report(onError)),
    );
  },
};

/** Runs `attach` and hands back the no-op unsubscribe the interface promises. */
function emit(attach: () => void): Unsubscribe {
  attach();
  return () => {};
}

function report(onError?: WatchErrorHandler): (error: unknown) => void {
  return (error) => {
    if (onError) onError(error instanceof Error ? error : new Error(String(error)));
  };
}
