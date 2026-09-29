/**
 * Fills the emulator with a demo household: 5 members, 3 periods and ~30
 * expenses covering all three split modes and both funding sources.
 *
 *   npm run emulators                                   # in one terminal
 *   npm run dev                                          # create a household at /setup
 *   npm run seed:emulator -- --household=<anonymous uid> # in a third terminal
 *
 * Without `--household` it creates a standalone household and prints its id,
 * which is handy for tests but not reachable from the app: the rules only let a
 * signed-in uid touch its own household, and an app's uid is whatever the
 * browser's anonymous sign-in produced.
 *
 * It therefore writes through the Admin SDK, which bypasses the rules by design
 * — the rules are covered by `npm run test:rules` instead, and this script is a
 * development convenience, not a path that proves anything about security.
 */

const host = process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080";
if (!/^(127\.0\.0\.1|localhost|\[::1\]):/.test(host)) {
  throw new Error(`Refusing to seed ${host}: this script only writes to the local emulator.`);
}
process.env.FIRESTORE_EMULATOR_HOST = host;

import { randomUUID } from "node:crypto";
import { initializeApp } from "firebase-admin/app";
import {
  getFirestore,
  Timestamp,
  type DocumentReference,
  type QueryDocumentSnapshot,
} from "firebase-admin/firestore";

import { computeShares, type SplitEntry, type SplitMode } from "@/lib/split/engine";
import { DEFAULT_CATEGORIES } from "@/lib/firebase/paths";

const PROJECT_ID = "expensessplit-cb870";

initializeApp({ projectId: PROJECT_ID });

const db = getFirestore(PROJECT_ID);
const now = Timestamp.now();

const MEMBERS = [
  { id: "seed-alex", name: "Alex", avatar: "🦊", colorHex: "#F87171" },
  { id: "seed-sam", name: "Sam", avatar: "🐼", colorHex: "#60A5FA" },
  { id: "seed-jules", name: "Jules", avatar: "🐙", colorHex: "#34D399" },
  { id: "seed-rin", name: "Rin", avatar: "🦉", colorHex: "#FBBF24" },
  { id: "seed-dev", name: "Dev", avatar: "🐢", colorHex: "#C084FC" },
];

const ALL = MEMBERS.map((m) => m.id);
const except = (...ids: string[]) => ALL.filter((id) => !ids.includes(id));

const PERIODS = [
  { id: "seed-august", name: "August", startDate: "2026-08-01", endDate: "2026-08-31" },
  { id: "seed-september", name: "September", startDate: "2026-09-01", endDate: "2026-09-30" },
  // Deliberately overlapping September: PLAN.md §1 allows overlapping periods
  // because one period may cover a different purpose than another.
  { id: "seed-holiday", name: "Holiday 2026", startDate: "2026-09-20", endDate: "2026-10-05" },
];

type Draft = {
  name: string;
  description?: string;
  amountMinor: number;
  categoryId: string;
  /** Day of the month, clamped to the period's last day. */
  day: number;
  splitMode: SplitMode;
  participants: string[];
  percentBps?: (id: string) => number;
  valueMinor?: (id: string) => number;
  /** Set to a member id to make the expense pre-paid by them. */
  paidBy?: string;
};

function entriesFor(draft: Draft): SplitEntry[] {
  return draft.participants.map((memberId) => ({
    memberId,
    valueMinor: draft.splitMode === "exact" ? (draft.valueMinor?.(memberId) ?? 0) : null,
    percentBps: draft.splitMode === "percent" ? (draft.percentBps?.(memberId) ?? 0) : null,
  }));
}

function sharesFor(draft: Draft): Record<string, number> {
  const result = computeShares({
    amountMinor: draft.amountMinor,
    mode: draft.splitMode,
    participants: draft.participants,
    entries: entriesFor(draft),
  });
  if (result.error) {
    throw new Error(`Seed draft "${draft.name}" does not balance: ${result.error}`);
  }
  return result.shares;
}

/** A weighting that always sums to 10000 bps. */
function bps(weights: Record<string, number>): (id: string) => number {
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  return (id: string) => Math.round((weights[id] / total) * 10000);
}

/** An exact split that always sums to the expense total. */
function cents(weights: Record<string, number>, total: number): (id: string) => number {
  const keys = Object.keys(weights);
  const sum = Object.values(weights).reduce((a, b) => a + b, 0);
  return (id: string) => {
    const index = keys.indexOf(id);
    const isLast = index === keys.length - 1;
    if (isLast) return total - keys.slice(0, -1).reduce((acc, key) => acc + Math.floor((weights[key] / sum) * total), 0);
    return Math.floor((weights[id] / sum) * total);
  };
}

function dateIn(period: (typeof PERIODS)[number], day: number): string {
  const lastDay = Number(period.endDate.slice(8, 10));
  return `${period.startDate.slice(0, 7)}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}

const PLAN: Record<string, Draft[]> = {
  [PERIODS[0].id]: [
    { name: "Rent", amountMinor: 185000, categoryId: "rent", day: 1, splitMode: "equal", participants: ALL },
    {
      name: "Electricity", amountMinor: 14237, categoryId: "utilities", day: 4, splitMode: "percent",
      participants: ALL, percentBps: bps({ "seed-jules": 32, "seed-dev": 23, "seed-rin": 19, "seed-sam": 15, "seed-alex": 11 }),
    },
    { name: "Weekly shop", amountMinor: 8734, categoryId: "groceries", day: 7, splitMode: "equal", participants: ALL },
    {
      name: "Broadband", amountMinor: 4200, categoryId: "utilities", day: 8, splitMode: "exact",
      participants: ["seed-alex", "seed-sam", "seed-jules"], valueMinor: cents({ a: 1, b: 1, c: 1 }, 4200),
    },
    { name: "Bike repairs", amountMinor: 7650, categoryId: "transport", day: 12, splitMode: "exact", participants: ["seed-jules"], valueMinor: () => 7650 },
    { name: "Weekly shop", amountMinor: 9120, categoryId: "groceries", day: 14, splitMode: "equal", participants: ALL },
    {
      name: "Dinner out", amountMinor: 12640, categoryId: "dining", day: 16, splitMode: "percent",
      participants: ALL, percentBps: bps({ "seed-alex": 30, "seed-sam": 25, "seed-jules": 20, "seed-rin": 15, "seed-dev": 10 }),
    },
    {
      name: "Pharmacy", amountMinor: 2475, categoryId: "health", day: 19, splitMode: "exact",
      participants: ["seed-rin", "seed-alex"], valueMinor: cents({ a: 3, b: 2 }, 2475),
    },
    // Pre-paid: the account reimburses Sam in full and his own share nets off,
    // which is the §1 worked example.
    { name: "Cinema", amountMinor: 3800, categoryId: "entertainment", day: 22, splitMode: "equal", participants: except("seed-dev"), paidBy: "seed-sam" },
    { name: "Train tickets", amountMinor: 9600, categoryId: "transport", day: 25, splitMode: "equal", participants: except("seed-rin", "seed-dev"), paidBy: "seed-alex" },
    { name: "Weekly shop", amountMinor: 8455, categoryId: "groceries", day: 28, splitMode: "equal", participants: ALL },
    { name: "Cleaning supplies", amountMinor: 2199, categoryId: "household", day: 30, splitMode: "equal", participants: ALL },
  ],
  [PERIODS[1].id]: [
    { name: "Rent", amountMinor: 185000, categoryId: "rent", day: 1, splitMode: "equal", participants: ALL },
    {
      name: "Gas", amountMinor: 6180, categoryId: "utilities", day: 3, splitMode: "percent",
      participants: ALL, percentBps: bps({ "seed-alex": 30, "seed-sam": 25, "seed-jules": 20, "seed-rin": 15, "seed-dev": 10 }),
    },
    { name: "Weekly shop", amountMinor: 9931, categoryId: "groceries", day: 6, splitMode: "equal", participants: ALL },
    { name: "Prescriptions", amountMinor: 1420, categoryId: "health", day: 9, splitMode: "exact", participants: ["seed-rin"], valueMinor: () => 1420 },
    { name: "Weekly shop", amountMinor: 8745, categoryId: "groceries", day: 13, splitMode: "equal", participants: ALL },
    {
      name: "Roof repair", description: "Storm damage to the back roof", amountMinor: 42000, categoryId: "household", day: 16, splitMode: "percent",
      participants: ALL, percentBps: bps({ "seed-alex": 40, "seed-sam": 25, "seed-jules": 15, "seed-rin": 10, "seed-dev": 10 }),
    },
    { name: "Weekly shop", amountMinor: 9210, categoryId: "groceries", day: 20, splitMode: "equal", participants: ALL },
    {
      name: "Concert tickets", amountMinor: 15600, categoryId: "entertainment", day: 23, splitMode: "exact",
      participants: ["seed-alex", "seed-jules", "seed-dev"], valueMinor: cents({ a: 2, b: 1, c: 1 }, 15600),
    },
    { name: "Weekly shop", amountMinor: 8877, categoryId: "groceries", day: 27, splitMode: "equal", participants: ALL },
    {
      name: "Coffee and pastry", amountMinor: 1875, categoryId: "dining", day: 29, splitMode: "percent",
      participants: ["seed-sam", "seed-rin"], percentBps: bps({ "seed-sam": 60, "seed-rin": 40 }),
    },
  ],
  [PERIODS[2].id]: [
    {
      name: "Flights", amountMinor: 134000, categoryId: "transport", day: 21, splitMode: "exact",
      participants: ALL, valueMinor: cents({ a: 1, b: 1, c: 2, d: 2, e: 2 }, 134000),
    },
    {
      name: "Holiday cottage", amountMinor: 96000, categoryId: "rent", day: 21, splitMode: "percent",
      participants: ALL, percentBps: bps({ "seed-alex": 25, "seed-sam": 25, "seed-jules": 20, "seed-rin": 15, "seed-dev": 15 }),
    },
    { name: "Grocery run", amountMinor: 6420, categoryId: "groceries", day: 22, splitMode: "equal", participants: ALL },
    { name: "Fuel", amountMinor: 5310, categoryId: "transport", day: 24, splitMode: "equal", participants: ["seed-alex", "seed-sam"], paidBy: "seed-sam" },
    { name: "Souvenirs", amountMinor: 4290, categoryId: "entertainment", day: 26, splitMode: "equal", participants: ["seed-rin", "seed-jules", "seed-dev"] },
    {
      name: "Dinner, night two", amountMinor: 13840, categoryId: "dining", day: 28, splitMode: "percent",
      participants: ALL, percentBps: bps({ "seed-alex": 30, "seed-sam": 25, "seed-jules": 20, "seed-rin": 15, "seed-dev": 10 }),
    },
    { name: "Grocery run", amountMinor: 7105, categoryId: "groceries", day: 30, splitMode: "equal", participants: ALL },
  ],
};

async function seed(householdId: string) {
  const household = db.collection("households").doc(householdId);
  const memberIds = MEMBERS.map((m) => m.id);
  const existing = (await household.get()).get("memberIds") as string[] | undefined;

  // Re-running the seed replaces the demo periods outright, so a leftover
  // expense from a previous run cannot skew a period's denormalised total.
  for (const period of PERIODS) {
    await clearExpenses(household.collection("periods").doc(period.id));
  }

  const batch = db.batch();

  batch.set(
    household,
    {
      name: "Demo household",
      memberUids: [householdId],
      // Append-only, and the rules require a member id to be registered before
      // its document exists — so both sides are written here.
      memberIds: Array.from(new Set([...(existing ?? []), ...memberIds])),
      settings: { defaultCategoryId: "other" },
      schemaVersion: 1,
      updatedAt: now,
    },
    { merge: true },
  );
  for (const member of MEMBERS) {
    batch.set(household.collection("members").doc(member.id), {
      name: member.name,
      avatar: member.avatar,
      colorHex: member.colorHex,
      archived: false,
      createdAt: now,
      updatedAt: now,
    });
  }
  batch.set(household.collection("meta").doc("categories"), {
    categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })),
    createdAt: now,
    updatedAt: now,
  });

  for (const period of PERIODS) {
    const drafts = PLAN[period.id] ?? [];
    const periodRef = household.collection("periods").doc(period.id);

    batch.set(periodRef, {
      name: period.name,
      startDate: period.startDate,
      endDate: period.endDate,
      status: "in_progress",
      totalAmountMinor: drafts.reduce((sum, d) => sum + d.amountMinor, 0),
      expenseCount: drafts.length,
      settledAt: null,
      createdAt: now,
      updatedAt: now,
    });

    for (const draft of drafts) {
      batch.set(periodRef.collection("expenses").doc(randomUUID()), {
        periodId: period.id,
        date: dateIn(period, draft.day),
        name: draft.name,
        description: draft.description ?? "",
        amountMinor: draft.amountMinor,
        isPrePaid: draft.paidBy !== undefined,
        paidBy: draft.paidBy ?? null,
        categoryId: draft.categoryId,
        splitMode: draft.splitMode,
        participants: draft.participants,
        splitEntries: entriesFor(draft),
        sharesMinor: sharesFor(draft),
        excluded: false,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  await batch.commit();

  const expenseCount = Object.values(PLAN).reduce((sum, drafts) => sum + drafts.length, 0);
  return { expenseCount };
}

/** Deletes every expense in a period, 400 at a time. */
async function clearExpenses(periodRef: DocumentReference): Promise<void> {
  for (;;) {
    const page = await periodRef.collection("expenses").limit(400).get();
    if (page.empty) return;
    const batch = db.batch();
    page.docs.forEach((snap: QueryDocumentSnapshot) => batch.delete(snap.ref));
    await batch.commit();
    if (page.docs.length < 400) return;
  }
}

async function main() {
  const arg = process.argv.find((a) => a.startsWith("--household="));
  const householdId = arg?.slice("--household=".length) ?? `demo-${randomUUID()}`;

  const exists = (await db.collection("households").doc(householdId).get()).exists;
  if (!exists) {
    await db.collection("households").doc(householdId).set({
      name: "Demo household",
      memberUids: [householdId],
      memberIds: [],
      settings: { defaultCategoryId: "other" },
      schemaVersion: 1,
      createdAt: now,
      updatedAt: now,
    });
  }

  const { expenseCount } = await seed(householdId);

  console.log(
    [
      `Seeded household "${householdId}"`,
      `  ${MEMBERS.length} members, ${PERIODS.length} periods, ${expenseCount} expenses`,
      arg
        ? "  Open it in the app — this replaced the members and periods you had."
        : "  This household was created fresh and no browser is signed in as it. To use it,",
      arg ? "" : "  re-run with --household=<uid from 1stsplit:householdId in the browser>.",
    ]
      .filter(Boolean)
      .join("\n"),
  );
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
