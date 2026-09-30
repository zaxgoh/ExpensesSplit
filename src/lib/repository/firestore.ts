/**
 * Firestore implementation of the Repository interface.
 *
 * Three things in here are not mechanical translations:
 *
 *  1. **Timestamps.** Firestore stores `createdAt`/`updatedAt` as a `Timestamp`
 *     written with `serverTimestamp()`, because the rules require
 *     `createdAt == request.time` and only a server timestamp can satisfy that.
 *     The domain types keep plain `number` milliseconds, so this file is the
 *     only place the conversion happens.
 *
 *  2. **Period totals.** `totalAmountMinor` and `expenseCount` are recomputed
 *     from the period's expenses and written in the *same* `writeBatch` as the
 *     expense that changed them, so the home table can never drift from the
 *     expenses. Firestore rules cannot check this — a rule cannot see the other
 *     writes in a batch — so it is this repository's job, and the tests'.
 *
 *  3. **Deleting a period.** Firestore does not cascade: deleting
 *     `periods/{id}` orphans its expenses. The expenses are deleted first, in
 *     chunks, and the period document last, so an interrupted delete leaves a
 *     visible period rather than a hidden one full of unreachable data.
 */

import {
  collection,
  deleteDoc,
  doc,
  documentId,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  startAfter,
  Timestamp,
  updateDoc,
  writeBatch,
  type DocumentData,
  type Firestore,
  type QueryConstraint,
  type QueryDocumentSnapshot,
  type Unsubscribe as FirestoreUnsubscribe,
} from "firebase/firestore";

import {
  ensureSignedIn,
  getDb,
  getStoredHouseholdId,
  setStoredHouseholdId,
} from "@/lib/firebase/client";
import {
  categoriesDoc,
  DEFAULT_CATEGORIES,
  expenseDoc,
  expensesCol,
  householdDoc,
  memberDoc,
  membersCol,
  periodDoc,
  periodsCol,
} from "@/lib/firebase/paths";
import type {
  CreateExpenseInput,
  CreatePeriodInput,
  Repository,
  Unsubscribe,
  WatchErrorHandler,
} from "@/lib/repository/types";
import type { Category, Expense, ExpensePeriod, Household, Member } from "@/types";

/** Firestore's hard batch limit is 500; 400 leaves headroom and matches §8. */
const BATCH_LIMIT = 400;

// ------------------------------------------------------------ serialisation

function toMillis(value: unknown): number {
  if (value instanceof Timestamp) return value.toMillis();
  if (typeof value === "number") return value;
  return 0;
}

function toTimestampOrNull(value: number | null | undefined): Timestamp | null {
  return typeof value === "number" ? Timestamp.fromMillis(value) : null;
}

function memberFromSnap(snap: QueryDocumentSnapshot<DocumentData>): Member {
  const data = snap.data();
  return {
    id: snap.id,
    name: data.name,
    avatar: data.avatar,
    colorHex: data.colorHex,
    archived: data.archived === true,
    createdAt: toMillis(data.createdAt),
    updatedAt: toMillis(data.updatedAt),
  };
}

function periodFromSnap(snap: QueryDocumentSnapshot<DocumentData>): ExpensePeriod {
  const data = snap.data();
  return {
    id: snap.id,
    name: data.name,
    startDate: data.startDate,
    endDate: data.endDate,
    status: data.status,
    totalAmountMinor: data.totalAmountMinor,
    expenseCount: data.expenseCount,
    settledAt: data.settledAt == null ? null : toMillis(data.settledAt),
    createdAt: toMillis(data.createdAt),
    updatedAt: toMillis(data.updatedAt),
  };
}

function expenseFromSnap(snap: QueryDocumentSnapshot<DocumentData>): Expense {
  const data = snap.data();
  return {
    id: snap.id,
    periodId: data.periodId,
    date: data.date,
    name: data.name,
    description: data.description,
    amountMinor: data.amountMinor,
    isPrePaid: data.isPrePaid === true,
    paidBy: data.paidBy ?? null,
    categoryId: data.categoryId,
    splitMode: data.splitMode,
    participants: data.participants,
    splitEntries: data.splitEntries,
    sharesMinor: data.sharesMinor,
    excluded: data.excluded === true,
    createdAt: toMillis(data.createdAt),
    updatedAt: toMillis(data.updatedAt),
  };
}

/** Member fields. `id` is not stored: it is the document path. */
function memberFields(member: Partial<Member>): DocumentData {
  return stripUndefined({
    name: member.name,
    avatar: member.avatar,
    colorHex: member.colorHex,
    archived: member.archived,
  });
}

/** Expense fields. `id` is the document path and `periodId` is its parent. */
function expenseFields(expense: Partial<Expense>): DocumentData {
  return stripUndefined({
    date: expense.date,
    name: expense.name,
    description: expense.description,
    amountMinor: expense.amountMinor,
    isPrePaid: expense.isPrePaid,
    paidBy: expense.paidBy,
    categoryId: expense.categoryId,
    splitMode: expense.splitMode,
    participants: expense.participants,
    splitEntries: expense.splitEntries,
    sharesMinor: expense.sharesMinor,
    excluded: expense.excluded,
  });
}

function periodFields(period: Partial<ExpensePeriod>): DocumentData {
  return stripUndefined({
    name: period.name,
    startDate: period.startDate,
    endDate: period.endDate,
    status: period.status,
    totalAmountMinor: period.totalAmountMinor,
    expenseCount: period.expenseCount,
    // Undefined, not null: a rename patch carries no settledAt, and coercing
    // that to null would silently un-settle a settled period.
    settledAt: period.settledAt === undefined ? undefined : toTimestampOrNull(period.settledAt),
  });
}

/**
 * `updateDoc` throws on an explicit `undefined`, so a patch that only touches
 * one field has to drop the rest rather than null them.
 */
function stripUndefined(fields: DocumentData): DocumentData {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));
}

// ------------------------------------------------------------------- writes

/** Create, stamping both timestamps with the server's clock. */
async function createDoc(db: Firestore, path: string, fields: DocumentData): Promise<void> {
  await setDoc(doc(db, path), {
    ...fields,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

/** Update, stamping `updatedAt` only. `createdAt` is immutable. */
async function patchDoc(db: Firestore, path: string, fields: DocumentData): Promise<void> {
  await updateDoc(doc(db, path), { ...stripUndefined(fields), updatedAt: serverTimestamp() });
}

// ---------------------------------------------------------------- identity

let householdIdPromise: Promise<string> | null = null;

/**
 * The household id is the anonymous uid. `ensureSignedIn` is memoised so a page
 * load signs in exactly once, and localStorage is reconciled against it: if the
 * persisted id disagrees with the current uid, the uid wins. Trusting the cached
 * key would otherwise open a different household's state after any loss of the
 * anonymous account.
 */
function householdId(): Promise<string> {
  if (!householdIdPromise) {
    householdIdPromise = (async () => {
      const uid = await ensureSignedIn();
      if (getStoredHouseholdId() !== uid) setStoredHouseholdId(uid);
      return uid;
    })();
  }
  return householdIdPromise;
}

/** Test seam: forget the memoised uid so the next call signs in again. */
export function resetFirebaseIdentity(): void {
  householdIdPromise = null;
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

// ----------------------------------------------------------------- helpers

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

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

/** Stable colour per member so a member keeps their colour across devices. */
function colorFor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

type PendingChange =
  | { kind: "add" | "replace"; expense: Expense }
  | { kind: "remove"; id: string }
  | { kind: "none" };

/**
 * The denormalised total and count for a period, reflecting one pending change.
 *
 * Recomputed from the expenses subcollection rather than adjusted
 * incrementally: the incremental version is one read cheaper per write but
 * silently drifts the first time a subtraction is wrong, and this is the number
 * the home table renders for every period.
 */
async function periodTotals(
  hid: string,
  periodId: string,
  change: PendingChange = { kind: "none" },
): Promise<{ totalAmountMinor: number; expenseCount: number }> {
  const snap = await getDocs(query(collection(getDb(), expensesCol(hid, periodId))));
  const live = new Map<string, Expense>();
  snap.docs.forEach((child) => live.set(child.id, expenseFromSnap(child)));

  if (change.kind === "add" || change.kind === "replace") live.set(change.expense.id, change.expense);
  if (change.kind === "remove") live.delete(change.id);

  let totalAmountMinor = 0;
  let expenseCount = 0;
  live.forEach((expense) => {
    if (expense.excluded) return;
    totalAmountMinor += expense.amountMinor;
    expenseCount += 1;
  });
  return { totalAmountMinor, expenseCount };
}

function queuePeriodTotals(
  batch: ReturnType<typeof writeBatch>,
  hid: string,
  periodId: string,
  totals: { totalAmountMinor: number; expenseCount: number },
): void {
  batch.set(
    doc(getDb(), periodDoc(hid, periodId)),
    { totalAmountMinor: totals.totalAmountMinor, expenseCount: totals.expenseCount, updatedAt: serverTimestamp() },
    { merge: true },
  );
}

async function requireOpenPeriod(
  hid: string,
  periodId: string,
  action: string,
): Promise<ExpensePeriod> {
  const snap = await getDoc(doc(getDb(), periodDoc(hid, periodId)));
  if (!snap.exists()) throw new Error("Expense period not found.");
  const period = periodFromSnap(snap as QueryDocumentSnapshot<DocumentData>);
  if (period.status === "settled") {
    throw new Error(`Cannot ${action} in a settled expense period. Reopen it first.`);
  }
  return period;
}

/** Mirrors the rules' date-range check, so the error is a message, not a code. */
function assertDateInPeriod(period: ExpensePeriod, date: string): void {
  if (date < period.startDate || date > period.endDate) {
    throw new Error(
      `Expense date ${date} falls outside the period ` +
        `(${period.startDate} to ${period.endDate}).`,
    );
  }
}

// ---------------------------------------------------------------- watchers

function watchCollection<T>(
  path: string,
  map: (snaps: QueryDocumentSnapshot<DocumentData>[]) => T[],
  onNext: (items: T[]) => void,
  onError: WatchErrorHandler | undefined,
  order?: string,
): Unsubscribe {
  const db = getDb();
  const constraints: QueryConstraint[] = order ? [orderBy(order, "asc")] : [];
  const unsubscribe: FirestoreUnsubscribe = onSnapshot(
    query(collection(db, path), ...constraints),
    (snap) => onNext(map(snap.docs)),
    (error) => onError?.(asError(error)),
  );
  return unsubscribe;
}

function watchDocument<T>(
  path: string,
  map: (data: DocumentData | null) => T,
  onNext: (value: T) => void,
  onError: WatchErrorHandler | undefined,
): Unsubscribe {
  const unsubscribe: FirestoreUnsubscribe = onSnapshot(
    doc(getDb(), path),
    (snap) => onNext(map(snap.exists() ? snap.data() : null)),
    (error) => onError?.(asError(error)),
  );
  return unsubscribe;
}

/**
 * Most subscriptions need the household id before they can exist, and the id
 * arrives from an async sign-in. This returns a working unsubscribe immediately
 * and defers attaching the listener, so callers never have to handle a promise.
 */
function defer<T>(attach: (hid: string) => Unsubscribe, onError?: WatchErrorHandler): Unsubscribe {
  let cancelled = false;
  let inner: Unsubscribe = () => {};
  void householdId()
    .then((hid) => {
      if (cancelled) return;
      inner = attach(hid);
    })
    .catch((error) => onError?.(asError(error)));
  return () => {
    cancelled = true;
    inner();
  };
}

// -------------------------------------------------------------- repository

export function createFirestoreRepository(): Repository {
  return {
    // ----------------------------------------------------------- household

    async getHousehold() {
      const hid = await householdId();
      const snap = await getDoc(doc(getDb(), householdDoc(hid)));
      if (!snap.exists()) return null;
      const data = snap.data();
      return {
        id: hid,
        name: data.name,
        memberUids: data.memberUids,
        memberIds: data.memberIds,
        settings: data.settings,
        schemaVersion: data.schemaVersion,
        createdAt: toMillis(data.createdAt),
        updatedAt: toMillis(data.updatedAt),
      } satisfies Household;
    },

    async createHousehold(name) {
      const hid = await householdId();
      const now = Date.now();
      const household: Household = {
        id: hid,
        name: name.trim(),
        memberUids: [hid],
        memberIds: [],
        settings: { defaultCategoryId: "other" },
        schemaVersion: 1,
        createdAt: now,
        updatedAt: now,
      };
      const db = getDb();
      await createDoc(db, householdDoc(hid), {
        name: household.name,
        memberUids: household.memberUids,
        memberIds: household.memberIds,
        settings: household.settings,
        schemaVersion: household.schemaVersion,
      });
      // Seeded in a second write, not the same batch: the categories rule
      // authorises on `isMember`, which reads committed state, and the household
      // document does not exist until this first write lands.
      await createDoc(db, categoriesDoc(hid), {
        categories: DEFAULT_CATEGORIES.map((category) => ({ ...category })),
      });
      return household;
    },

    // ------------------------------------------------------------- members

    async listMembers() {
      const hid = await householdId();
      const snap = await getDocs(collection(getDb(), membersCol(hid)));
      return snap.docs.map(memberFromSnap);
    },

    async createMember(name, avatar) {
      const hid = await householdId();
      const db = getDb();
      const household = await getDoc(doc(db, householdDoc(hid)));
      const registered: string[] = household.data()?.memberIds ?? [];
      const id = newId();
      const now = Date.now();
      const member: Member = {
        id,
        name: name.trim(),
        avatar: avatar && avatar.length > 0 ? avatar : "🦊",
        colorHex: colorFor(id),
        archived: false,
        createdAt: now,
        updatedAt: now,
      };
      // The member document and its registration in the household's memberIds
      // commit together: the rules refuse a member document whose id is not
      // registered, and refuse a household update that adds more than one id.
      const batch = writeBatch(db);
      batch.set(doc(db, memberDoc(hid, id)), {
        ...memberFields(member),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      batch.set(
        doc(db, householdDoc(hid)),
        { memberIds: [...registered, id], updatedAt: serverTimestamp() },
        { merge: true },
      );
      await batch.commit();
      return member;
    },

    async updateMember(id, patch) {
      const hid = await householdId();
      await patchDoc(getDb(), memberDoc(hid, id), memberFields(patch));
    },

    async archiveMember(id) {
      await this.updateMember(id, { archived: true });
    },

    // ------------------------------------------------------------- periods

    async listPeriods() {
      const hid = await householdId();
      const snap = await getDocs(
        query(collection(getDb(), periodsCol(hid)), orderBy("startDate", "asc")),
      );
      return snap.docs.map(periodFromSnap);
    },

    async createPeriod(input: CreatePeriodInput) {
      const hid = await householdId();
      const now = Date.now();
      const period: ExpensePeriod = {
        ...input,
        id: newId(),
        name: input.name.trim(),
        status: "in_progress",
        totalAmountMinor: 0,
        expenseCount: 0,
        settledAt: null,
        createdAt: now,
        updatedAt: now,
      };
      await createDoc(getDb(), periodDoc(hid, period.id), periodFields(period));
      return period;
    },

    async updatePeriod(id, patch) {
      const hid = await householdId();
      await patchDoc(getDb(), periodDoc(hid, id), periodFields(patch));
    },

    async deletePeriod(id) {
      const hid = await householdId();
      const db = getDb();
      const path = expensesCol(hid, id);

      // 1. Every expense, in chunks, so nothing is orphaned.
      let cursor: QueryDocumentSnapshot<DocumentData> | null = null;
      for (;;) {
        const constraints: QueryConstraint[] = cursor
          ? [orderBy(documentId()), startAfter(cursor), limit(BATCH_LIMIT)]
          : [orderBy(documentId()), limit(BATCH_LIMIT)];
        const page = await getDocs(query(collection(db, path), ...constraints));
        if (page.empty) break;
        const batch = writeBatch(db);
        page.docs.forEach((snap) => batch.delete(snap.ref));
        await batch.commit();
        if (page.docs.length < BATCH_LIMIT) break;
        cursor = page.docs[page.docs.length - 1] as QueryDocumentSnapshot<DocumentData>;
      }

      // 2. The period document last, so an interrupted delete leaves a visible
      //    period with whatever expenses remain, rather than hiding live data
      //    behind a document that is already gone.
      await deleteDoc(doc(db, periodDoc(hid, id)));
    },

    // ----------------------------------------------------------- expenses

    async listExpenses(periodId) {
      const hid = await householdId();
      const snap = await getDocs(
        query(collection(getDb(), expensesCol(hid, periodId)), orderBy("date", "asc")),
      );
      return snap.docs.map(expenseFromSnap);
    },

    async createExpense(input: CreateExpenseInput) {
      const hid = await householdId();
      const parent = await requireOpenPeriod(hid, input.periodId, "add an expense");
      assertDateInPeriod(parent, input.date);

      const now = Date.now();
      const expense: Expense = { ...input, id: newId(), createdAt: now, updatedAt: now };
      const totals = await periodTotals(hid, input.periodId, { kind: "add", expense });

      const db = getDb();
      const batch = writeBatch(db);
      batch.set(doc(db, expenseDoc(hid, input.periodId, expense.id)), {
        ...expenseFields(expense),
        periodId: input.periodId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      queuePeriodTotals(batch, hid, input.periodId, totals);
      await batch.commit();
      return expense;
    },

    async updateExpense(id, periodId, patch) {
      const hid = await householdId();
      const parent = await requireOpenPeriod(hid, periodId, "edit an expense");
      const db = getDb();

      const snap = await getDoc(doc(db, expenseDoc(hid, periodId, id)));
      if (!snap.exists()) return;
      const current = expenseFromSnap(snap as QueryDocumentSnapshot<DocumentData>);
      const next: Expense = { ...current, ...patch, id, periodId, createdAt: current.createdAt };
      if (patch.date !== undefined) assertDateInPeriod(parent, next.date);

      const totals = await periodTotals(hid, periodId, { kind: "replace", expense: next });
      const batch = writeBatch(db);
      batch.set(doc(db, expenseDoc(hid, periodId, id)), expenseFields(next), { merge: true });
      queuePeriodTotals(batch, hid, periodId, totals);
      await batch.commit();
    },

    async deleteExpense(id, periodId) {
      const hid = await householdId();
      await requireOpenPeriod(hid, periodId, "delete an expense");

      const totals = await periodTotals(hid, periodId, { kind: "remove", id });
      const db = getDb();
      const batch = writeBatch(db);
      batch.delete(doc(db, expenseDoc(hid, periodId, id)));
      queuePeriodTotals(batch, hid, periodId, totals);
      await batch.commit();
    },

    // ----------------------------------------------------------- realtime

    subscribeHousehold(onNext, onError) {
      return defer(
        (hid) =>
          watchDocument(
            householdDoc(hid),
            (data) =>
              data
                ? ({
                    id: hid,
                    name: data.name,
                    memberUids: data.memberUids,
                    memberIds: data.memberIds,
                    settings: data.settings,
                    schemaVersion: data.schemaVersion,
                    createdAt: toMillis(data.createdAt),
                    updatedAt: toMillis(data.updatedAt),
                  } satisfies Household)
                : null,
            onNext,
            onError,
          ),
        onError,
      );
    },

    subscribeMembers(onNext, onError) {
      return defer(
        (hid) =>
          watchCollection(
            membersCol(hid),
            (snaps) => snaps.map(memberFromSnap),
            onNext,
            onError,
          ),
        onError,
      );
    },

    subscribePeriods(onNext, onError) {
      return defer(
        (hid) =>
          watchCollection(
            periodsCol(hid),
            (snaps) => snaps.map(periodFromSnap),
            onNext,
            onError,
            "startDate",
          ),
        onError,
      );
    },

    subscribeCategories(onNext, onError) {
      return defer(
        (hid) =>
          watchDocument(
            categoriesDoc(hid),
            (data) => ((data?.categories ?? []) as Category[]),
            onNext,
            onError,
          ),
        onError,
      );
    },

    subscribeExpenses(periodId, onNext, onError) {
      return defer(
        (hid) =>
          watchCollection(
            expensesCol(hid, periodId),
            (snaps) => snaps.map(expenseFromSnap),
            onNext,
            onError,
            "date",
          ),
        onError,
      );
    },
  };
}

/** The default repository the app runs on. Tests inject their own. */
export const firestoreRepository = createFirestoreRepository();
