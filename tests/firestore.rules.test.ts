/**
 * Firestore security rules tests.
 *
 * These run against the Firestore emulator, which is mandatory: rules are not
 * enforceable locally against the real service, and running them against
 * production would mean testing with live data.
 *
 *   npm run emulators        # in one terminal
 *   npm run test:rules       # in another
 *
 * The shape of the assertions follows PLAN.md §9: what has to be denied is the
 * interesting half, so every case asserts both the denial and the matching
 * success where one exists.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Firestore,
} from "firebase/firestore";

const PROJECT_ID = "expensessplit-rules";
const HOUSEHOLD = "household-1";
const OTHER_HOUSEHOLD = "household-2";
const MEMBER_A = "member-alex";
const MEMBER_B = "member-sam";

let testEnv: RulesTestEnvironment;

/**
 * A Firestore handle acting as `uid` — the anonymous account, in the app.
 *
 * The cast is needed because `RulesTestContext.firestore()` is still declared as
 * returning the *compat* `FirebaseFirestore.Firestore` type. At runtime it
 * returns a modular instance and the modular API below works against it, which
 * is the pattern in Google's own rules-testing guide; only the type is stale.
 */
function asUser(uid: string | null): Firestore {
  const context = uid ? testEnv.authenticatedContext(uid) : testEnv.unauthenticatedContext();
  return context.firestore() as unknown as Firestore;
}

const householdDoc = (hid = HOUSEHOLD) => doc(asUser(null), "households", hid);
const memberRef = (id: string, hid = HOUSEHOLD) =>
  doc(asUser(null), "households", hid, "members", id);
const periodRef = (id: string, hid = HOUSEHOLD) =>
  doc(asUser(null), "households", hid, "periods", id);
const expenseRef = (periodId: string, expenseId: string, hid = HOUSEHOLD) =>
  doc(asUser(null), "households", hid, "periods", periodId, "expenses", expenseId);

function householdData(uid: string) {
  return {
    name: "Maple Street",
    memberUids: [uid],
    memberIds: [MEMBER_A, MEMBER_B],
    settings: { defaultCategoryId: "other" },
    schemaVersion: 1,
    createdAt: serverTimestamp(),
  };
}

function memberData(overrides: Record<string, unknown> = {}) {
  return {
    name: "Alex",
    avatar: "🦊",
    colorHex: "#F87171",
    archived: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...overrides,
  };
}

function periodData(overrides: Record<string, unknown> = {}) {
  return {
    name: "September",
    startDate: "2026-09-01",
    endDate: "2026-09-30",
    status: "in_progress",
    totalAmountMinor: 0,
    expenseCount: 0,
    settledAt: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...overrides,
  };
}

function expenseData(overrides: Record<string, unknown> = {}) {
  return {
    periodId: "period-1",
    date: "2026-09-10",
    name: "Groceries",
    description: "",
    amountMinor: 10000,
    isPrePaid: false,
    paidBy: null,
    categoryId: "other",
    splitMode: "equal",
    participants: [MEMBER_A, MEMBER_B],
    splitEntries: [],
    sharesMinor: { [MEMBER_A]: 5000, [MEMBER_B]: 5000 },
    excluded: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...overrides,
  };
}

/** Household, two members and one open period, written as the owner. */
async function seedHousehold(uid = "owner"): Promise<void> {
  const db = asUser(uid);
  await setDoc(doc(db, "households", HOUSEHOLD), householdData(uid));
  await setDoc(doc(db, "households", HOUSEHOLD, "members", MEMBER_A), memberData());
  await setDoc(doc(db, "households", HOUSEHOLD, "members", MEMBER_B), memberData({ name: "Sam" }));
  await setDoc(doc(db, "households", HOUSEHOLD, "periods", "period-1"), periodData());
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(fileURLToPath(new URL("../firestore.rules", import.meta.url)), "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
  });
});

beforeEach(async () => {
  await testEnv?.clearFirestore();
});

afterAll(async () => {
  // Guarded because `beforeAll` never completes without the emulator, and an
  // unguarded `testEnv.cleanup()` would replace that useful error with a
  // "cannot read properties of undefined".
  await testEnv?.cleanup();
});

// ------------------------------------------------------------- bootstrapping

describe("household creation", () => {
  it("lets an anonymous uid create the household it is the sole member of", async () => {
    await assertSucceeds(
      setDoc(householdDoc(), householdData("fresh-uid")),
    );
  });

  it("refuses to create a household that lists someone else as a member", async () => {
    await assertFails(setDoc(householdDoc(), householdData("someone-else")));
  });

  it("refuses an unauthenticated create", async () => {
    await assertFails(setDoc(householdDoc(), householdData(null as unknown as string)));
  });
});

// -------------------------------------------------------------- authorisation

describe("authorisation", () => {
  beforeEach(seedHousehold);

  it("denies an unauthenticated read of the household", async () => {
    await assertFails(getDoc(householdDoc()));
  });

  it("denies a signed-in user who is not in memberUids", async () => {
    const outsider = asUser("stranger");
    await assertFails(getDoc(doc(outsider, "households", HOUSEHOLD)));
    await assertFails(getDocs(collection(outsider, "households", HOUSEHOLD, "periods")));
  });

  it("allows a member to read the household, its members and its periods", async () => {
    const owner = asUser("owner");
    await assertSucceeds(getDoc(doc(owner, "households", HOUSEHOLD)));
    await assertSucceeds(getDocs(collection(owner, "households", HOUSEHOLD, "members")));
    await assertSucceeds(getDocs(collection(owner, "households", HOUSEHOLD, "periods")));
  });

  it("denies a cross-household write", async () => {
    const owner = asUser("owner");
    await assertFails(
      setDoc(doc(owner, "households", OTHER_HOUSEHOLD, "periods", "p"), periodData()),
    );
  });

  it("keeps memberUids immutable", async () => {
    const owner = asUser("owner");
    await assertFails(
      updateDoc(doc(owner, "households", HOUSEHOLD), { memberUids: ["owner", "stranger"] }),
    );
  });

  it("lets memberIds grow by one, but not shrink and not jump", async () => {
    const owner = asUser("owner");
    await assertSucceeds(
      updateDoc(doc(owner, "households", HOUSEHOLD), {
        memberIds: [MEMBER_A, MEMBER_B, "member-new"],
      }),
    );
    await assertFails(
      updateDoc(doc(owner, "households", HOUSEHOLD), { memberIds: [MEMBER_A] }),
    );
    await assertFails(
      updateDoc(doc(owner, "households", HOUSEHOLD), {
        memberIds: [MEMBER_A, MEMBER_B, "member-x", "member-y"],
      }),
    );
  });
});

// -------------------------------------------------------------------- members

describe("members", () => {
  beforeEach(seedHousehold);

  it("refuses a member whose id is not registered in the household", async () => {
    const owner = asUser("owner");
    await assertFails(setDoc(memberRef("member-ghost"), memberData()));
  });

  it("archives by update and refuses to change createdAt", async () => {
    const owner = asUser("owner");
    await assertSucceeds(
      updateDoc(doc(owner, "households", HOUSEHOLD, "members", MEMBER_A), {
        archived: true,
        updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(
      updateDoc(doc(owner, "households", HOUSEHOLD, "members", MEMBER_A), {
        createdAt: serverTimestamp(),
      }),
    );
  });

  it("rejects a name longer than 40 characters", async () => {
    const owner = asUser("owner");
    await assertFails(
      updateDoc(doc(owner, "households", HOUSEHOLD, "members", MEMBER_A), {
        name: "x".repeat(41),
      }),
    );
  });
});

// -------------------------------------------------------------------- periods

describe("periods", () => {
  beforeEach(seedHousehold);

  it("rejects endDate before startDate", async () => {
    const owner = asUser("owner");
    await assertFails(
      setDoc(
        doc(owner, "households", HOUSEHOLD, "periods", "period-2"),
        periodData({ startDate: "2026-09-30", endDate: "2026-09-01" }),
      ),
    );
  });

  it("allows overlapping periods", async () => {
    const owner = asUser("owner");
    await assertSucceeds(
      setDoc(
        doc(owner, "households", HOUSEHOLD, "periods", "period-overlap"),
        periodData({ name: "Holiday", startDate: "2026-09-15", endDate: "2026-10-15" }),
      ),
    );
  });

  it("rejects a period created already settled", async () => {
    const owner = asUser("owner");
    await assertFails(
      setDoc(
        doc(owner, "households", HOUSEHOLD, "periods", "period-3"),
        periodData({ status: "settled" }),
      ),
    );
  });

  it("requires settledAt when settling and null when reopening", async () => {
    const owner = asUser("owner");
    const ref = doc(owner, "households", HOUSEHOLD, "periods", "period-1");

    // settled with no timestamp
    await assertFails(updateDoc(ref, { status: "settled" }));
    await assertSucceeds(
      updateDoc(ref, { status: "settled", settledAt: serverTimestamp() }),
    );
    // in progress still carrying a timestamp
    await assertFails(
      updateDoc(ref, { status: "in_progress", settledAt: serverTimestamp() }),
    );
    await assertSucceeds(updateDoc(ref, { status: "in_progress", settledAt: null }));
  });
});

// ------------------------------------------------------------------- expenses

describe("expenses", () => {
  beforeEach(seedHousehold);

  async function createExpense(overrides: Record<string, unknown> = {}, id = "expense-1") {
    const owner = asUser("owner");
    await setDoc(
      doc(owner, "households", HOUSEHOLD, "periods", "period-1", "expenses", id),
      expenseData(overrides),
    );
  }

  it("accepts a well-formed expense in an in-progress period", async () => {
    await expect(createExpense()).resolves.toBeUndefined();
  });

  it("rejects a non-positive or non-integer amount", async () => {
    await assertFails(createExpense({ amountMinor: 0, sharesMinor: { [MEMBER_A]: 0, [MEMBER_B]: 0 } }, "e1"));
    await assertFails(
      createExpense({ amountMinor: 1000.5, sharesMinor: { [MEMBER_A]: 500, [MEMBER_B]: 500.5 } }, "e2"),
    );
    await assertFails(
      createExpense({ amountMinor: -100, sharesMinor: { [MEMBER_A]: -50, [MEMBER_B]: -50 } }, "e3"),
    );
  });

  it("rejects shares that do not sum to the amount", async () => {
    await assertFails(
      createExpense({ sharesMinor: { [MEMBER_A]: 4000, [MEMBER_B]: 4000 } }, "e1"),
    );
  });

  it("rejects shares that do not cover exactly the participants", async () => {
    await assertFails(
      createExpense(
        { sharesMinor: { [MEMBER_A]: 5000, [MEMBER_B]: 4000, "member-ghost": 1000 } },
        "e1",
      ),
    );
    await assertFails(
      createExpense({ sharesMinor: { [MEMBER_A]: 10000 } }, "e2"),
    );
  });

  it("rejects an empty or duplicated participant list", async () => {
    await assertFails(
      createExpense(
        { participants: [], splitEntries: [], sharesMinor: {} },
        "e1",
      ),
    );
    await assertFails(
      createExpense(
        {
          participants: [MEMBER_A, MEMBER_A],
          splitEntries: [],
          sharesMinor: { [MEMBER_A]: 10000 },
        },
        "e2",
      ),
    );
  });

  it("rejects a participant who is not a member of this household", async () => {
    await assertFails(
      createExpense(
        {
          participants: [MEMBER_A, "member-ghost"],
          splitEntries: [],
          sharesMinor: { [MEMBER_A]: 5000, "member-ghost": 5000 },
        },
        "e1",
      ),
    );
  });

  it("enforces isPrePaid == (paidBy != null) in both directions", async () => {
    await assertFails(
      createExpense(
        {
          isPrePaid: true,
          paidBy: null,
          participants: [MEMBER_A, MEMBER_B],
          splitEntries: [],
          sharesMinor: { [MEMBER_A]: 5000, [MEMBER_B]: 5000 },
        },
        "e1",
      ),
    );
    await assertFails(
      createExpense(
        {
          isPrePaid: false,
          paidBy: MEMBER_A,
          participants: [MEMBER_A, MEMBER_B],
          splitEntries: [],
          sharesMinor: { [MEMBER_A]: 5000, [MEMBER_B]: 5000 },
        },
        "e2",
      ),
    );
    await assertSucceeds(
      createExpense(
        {
          isPrePaid: true,
          paidBy: MEMBER_A,
          participants: [MEMBER_A, MEMBER_B],
          splitEntries: [],
          sharesMinor: { [MEMBER_A]: 5000, [MEMBER_B]: 5000 },
        },
        "e3",
      ),
    );
  });

  it("rejects a payer who is not a member", async () => {
    await assertFails(
      createExpense({ isPrePaid: true, paidBy: "member-ghost" }, "e1"),
    );
  });

  it("rejects a date outside the period's range, and accepts both endpoints", async () => {
    await assertFails(createExpense({ date: "2026-08-31" }, "e1"));
    await assertFails(createExpense({ date: "2026-10-01" }, "e2"));
    await assertSucceeds(createExpense({ date: "2026-09-01" }, "e3"));
    await assertSucceeds(createExpense({ date: "2026-09-30" }, "e4"));
  });

  it("rejects a malformed date", async () => {
    await assertFails(createExpense({ date: "10/09/2026" }, "e1"));
  });

  it("rejects an unknown split mode", async () => {
    await assertFails(createExpense({ splitMode: "weighted" }, "e1"));
  });

  it("rejects mutating createdAt on update", async () => {
    await createExpense();
    const owner = asUser("owner");
    await assertFails(
      updateDoc(doc(owner, "households", HOUSEHOLD, "periods", "period-1", "expenses", "expense-1"), {
        name: "Renamed",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it("refuses every expense write against a settled period", async () => {
    const owner = asUser("owner");
    await updateDoc(doc(owner, "households", HOUSEHOLD, "periods", "period-1"), {
      status: "settled",
      settledAt: serverTimestamp(),
    });
    await expect(createExpense({}, "expense-late")).rejects.toThrow();
    await assertFails(deleteDoc(expenseRef("period-1", "expense-1")));

    // ... and accepts them again once the period is reopened.
    await updateDoc(doc(owner, "households", HOUSEHOLD, "periods", "period-1"), {
      status: "in_progress",
      settledAt: null,
    });
    await expect(createExpense({}, "expense-after")).resolves.toBeUndefined();
  });

  it("still allows reading expenses in a settled period", async () => {
    await createExpense();
    const owner = asUser("owner");
    await updateDoc(doc(owner, "households", HOUSEHOLD, "periods", "period-1"), {
      status: "settled",
      settledAt: serverTimestamp(),
    });
    await assertSucceeds(
      getDocs(collection(owner, "households", HOUSEHOLD, "periods", "period-1", "expenses")),
    );
  });

  it("refuses an expense write from a non-member", async () => {
    const outsider = asUser("stranger");
    await assertFails(
      setDoc(
        doc(outsider, "households", HOUSEHOLD, "periods", "period-1", "expenses", "e1"),
        expenseData(),
      ),
    );
  });
});

// ----------------------------------------------------------------------- meta

describe("meta", () => {
  beforeEach(seedHousehold);

  it("lets a member seed the categories once, then refuses further writes", async () => {
    const owner = asUser("owner");
    await assertSucceeds(
      setDoc(doc(owner, "households", HOUSEHOLD, "meta", "categories"), {
        categories: [{ id: "other", label: "Other", icon: "📦", colorHex: "#8A93A6" }],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );
    await assertSucceeds(getDoc(doc(owner, "households", HOUSEHOLD, "meta", "categories")));
    await assertFails(
      setDoc(doc(owner, "households", HOUSEHOLD, "meta", "categories"), { categories: [] }),
    );
    await assertFails(deleteDoc(doc(owner, "households", HOUSEHOLD, "meta", "categories")));
  });
});
