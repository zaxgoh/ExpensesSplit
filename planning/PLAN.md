# 1ST split — Specification

A household expense splitter. Next.js App Router + Firebase. No login.

This document is the build spec. Follow it as written.

---

## 1. Overview

A web app for a household (2–10 people) to record shared expenses in named **expense periods**, and
see at the end of each period **how much each member must transfer into the household account**.

### The money model (read this first)

There is **one shared household account** that expenses are paid out of. Members do not settle up
with each other.

- An expense is normally **paid from the account**.
- An expense may instead be **pre-paid by a member** — that member bought it on their own card or
  cash, so the account has to reimburse them instead.
- Each member's position for a period is the difference between **what they consumed** (their share
  of every expense in the period) and **what they already fronted**. That difference is a single
  transfer between that member and the household account — never a member-to-member payment.

```text
Alice consumed $300 of groceries but fronted $120 of them
  → Alice has already covered $120
  → Alice transfers $180 to the household account
  → the account reimburses her $0, because the $120 she fronted is
    netted off against what she consumed
```

A member never pays another member. A member with a negative amount is owed by the account.

### Splitting an expense

Every expense is split among the members, and **the split is what each member must transfer into the
account**. There is no separate "who consumed it" concept: a member's share of an expense *is* their
obligation for that expense. If the account paid a $90 electricity bill split three ways, each of the
three participants owes $30 into the account for that expense.

- The add-expense form requires the user to state how the expense is split, **unless the expense is
  pre-paid** (see the exception below).
- **Equal is the default** — the form opens with every member selected and equal shares, so the
  majority of expenses need no change to the split at all.
- The user can override it. There are exactly **three** modes, selectable per expense:
  **Equal** (default), **Exact amounts** (shares summing to exactly the expense total), and
  **Percentage** (shares summing to exactly 100%).
- The members an expense is split among are selectable per expense, and the choice is independent of
  who pre-paid it.
- The form shows each member's resulting amount live, before saving, and blocks saving when an
  explicit split does not balance. An equal split can never be unbalanced.

**Exception — a pre-paid expense has no split control.** When an expense is pre-paid, the whole split
section is hidden and the expense is split **equally across every non-archived member**. The maths is
unchanged: the account reimburses the fronting member the full amount, and their own share cancels
against it, so a $90 shop fronted by Alex and shared with Sam yields **Alex −$45, Sam +$45**. A
pre-paid expense is a reimbursement, not a write-off — the household's consumption still counts, and
the funding invariant in §4 still holds.

### Expense periods

The primary unit of organisation is a named **expense period**, not a calendar month. A period has a
name, a start date, an end date, and a status.

- Periods are created by the user and listed in a table on the home page.
- A period's status is `in progress` when created, and only becomes `settled` when the user changes
  it. Settling is a deliberate user action, never automatic.
- A settled period is locked read-only but can be reopened, which sets it back to `in progress`.
- Periods **may overlap in date range** — one period may cover a different purpose (e.g. a holiday
  budget) than another covering the same weeks. Do not reject a period for overlapping an existing
  one. Consequently a given calendar date can legitimately appear in more than one period, and
  expenses are always scoped to a period rather than derived from a date.

### Money format

There is **no currency setting**. Every amount in the app is formatted with a leading `$`, e.g.
`$1,234.56`, or `$1,235` for whole-dollar settlement figures. The household is never asked to choose
a currency, no currency field is stored, and no ISO-4217 exponent table is used. All amounts have
exactly two decimal places; the settlement rounding in §4 rounds to whole dollars.

### Core requirements

- Add/remove household members; add/edit/delete expenses.
- Create named expense periods with start and end dates; list, filter and open them.
- Every expense states how it is split among the selected members, defaulting to equal.
- A member's share of an expense is that member's transfer into the household account for it.
- Every expense records whether it was pre-paid and, if so, by whom.
- Settle a period: see each member's transfer amount, rounded up to whole dollars, and mark the
  period settled.
- Everything persists in Firestore — data survives reload and browser restart.
- **No login or authentication UI.**
- Visually polished dark-first UI.
- Deploys to Firebase App Hosting.

**Not in v1:** real accounts, multi-household, member-to-member settlement, multiple currencies or
FX, receipt photos, recurring expenses, notifications, payments, activity log, offline conflict
merging.

---

## 2. Tech stack

| Concern | Choice |
|---|---|
| Framework | Next.js 15+, App Router, TypeScript `strict` |
| Runtime | Node 20 (matches App Hosting build image) |
| Styling | Tailwind CSS v4 (CSS-first `@theme`, no `tailwind.config.js`) |
| Components | shadcn/ui (Radix primitives) — button, input, label, checkbox, switch, select, dialog, alert-dialog, popover, tabs, table, badge, calendar, separator |
| Date pickers | `react-day-picker` via shadcn `Calendar` in a `Popover` (dropdown date picker) |
| Icons | lucide-react |
| Class utils | `clsx` + `tailwind-merge` |
| Database | Cloud Firestore, client SDK v11+ with `persistentLocalCache` |
| Validation | Zod — one schema per write path, shared by the UI and the rules mirror |
| Money formatting | `Intl.NumberFormat` for `$` amounts |
| Date handling | `date-fns` (`format`, `parseISO`) for display and ISO-date parsing |
| Tests | Vitest (jsdom) for units and components, `@firebase/rules-unit-testing` for rules |
| QC | ESLint (`eslint-config-next`), Prettier, `tsc --noEmit` |

**No animation library.** No `framer-motion`/`motion` dependency, no keyframes, no transitions beyond
instant state changes. Static CSS only.

### Rendering strategy

The app is a client component inside a server-rendered shell. The household id lives in browser
storage, so data is not knowable at request time; SSR would add a round trip for no benefit. Multi-page
navigating between the period list and an individual period keeps each screen a single focused
collection query.

### Folder layout

```text
src/
  app/
    layout.tsx                    # <html>/<body> shell, fonts, HouseholdProvider
    page.tsx                      # home: expense period table + first-run setup dialog
    period/[periodId]/page.tsx    # expenses table + settlement for one period
    share/[token]/page.tsx       # share landing: the linked period, or the list
    share/[token]/periods/page.tsx  # shared list: period table + household panel, read-only
    share/[token]/period/[periodId]/page.tsx  # one shared period, read-only
    globals.css
  components/
    ui/            shadcn primitives
    layout/        HouseholdProvider.tsx, DatePicker.tsx, ThemeScript.tsx (+ theme toggle)
    periods/       PeriodTable, CreatePeriodDialog, StatusBadge, StatusFilter,
                   InlinePeriodName, ConfirmDeleteDialog, PeriodView, ShareDialog
    expenses/      ExpenseTable, AddExpenseForm
    settlement/    TransferSummary
    share/         SharedShell (token → read-only provider), ViewOnlyBanner
    members/       HouseholdSetupDialog (first-run modal), AddMemberDialog,
                   MemberList (home member list with inline rename)
  lib/
    repository/    types.ts (the Repository interface), local.ts (localStorage impl)
    firebase/      client.ts, emulator.ts, paths.ts
    share/         links.ts (share URL builder)
    split/         engine.ts, account.ts       (pure, no React/Firebase)
    money/         minorUnits.ts              (parse/format, ceil/floor whole dollars)
    validation/    schemas.ts
  types/           shared domain types
apphosting.yaml  apphosting.staging.yaml  apphosting.local.yaml
firebase.json  .firebaserc  firestore.rules  firestore.indexes.json
```

The split engine in `lib/split/` imports nothing from React or Firebase. That is required so it can
be unit-tested in isolation and reused anywhere.

**The `Repository` interface is the seam that matters.** Every component reads and writes through
`lib/repository/types.ts`, never through storage or the Firebase SDK directly. All methods are
`async` so the signature matches the Firestore SDK exactly, which makes swapping the localStorage
implementation for Firestore a single-file change rather than a rewrite. Components take an
optional `repository` prop defaulting to the local implementation, so tests inject their own.

**Known layout issue to fix:** the period table currently renders a non-functional sort control on
its "Total expense amount" header — it toggles the *start date* sort rather than sorting by total.
Per F2, only Start date is a sort control on that table; remove the Total header's button.

---

## 3. Data model

All money is stored as **integer cents**. Never floats. Never parse a float into storage. There is no
currency field anywhere.

```ts
type MinorUnits = number;        // integer, 1 unit = $0.01
type ISODate    = string;        // "YYYY-MM-DD"

type PeriodStatus = "in_progress" | "settled";

type Household = {
  id: string;                    // == the anonymous Firebase uid
  name: string;
  memberUids: string[];          // always ≥1 element; see §7
  settings: { defaultCategoryId: string };
  schemaVersion: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

type Member = {
  id: string;                    // random uuid
  name: string;                  // 1..40 chars, trimmed, unique case-insensitively per household
  avatar: string;                // emoji glyph; auto-assigned if omitted
  colorHex: string;              // from the palette in §6; derived from id hash if auto
  archived: boolean;             // soft-remove, keeps historical expenses valid
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

type ExpensePeriod = {
  id: string;                    // random uuid
  name: string;                  // 1..60 chars, unique case-insensitively per household
  startDate: ISODate;
  endDate: ISODate;              // MUST be >= startDate
  status: PeriodStatus;          // "in_progress" on create
  totalAmountMinor: number;      // denormalised Σ of non-excluded expense amounts; see below
  expenseCount: number;          // denormalised count of non-excluded expenses
  settledAt: Timestamp | null;   // set when status becomes "settled"; null otherwise
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

type SplitEntry = {
  memberId: string;
  valueMinor: number | null;     // exact mode
  percentBps: number | null;     // percent mode (1% = 100 bps)
};

type Expense = {
  id: string;
  periodId: string;              // owning period
  date: ISODate;                 // MUST fall within the owning period's [startDate, endDate]
  name: string;                  // 1..60 chars, short label
  description: string;           // 0..280 chars, may be empty
  amountMinor: number;           // >0, <= 1e9
  isPrePaid: boolean;            // true = a member fronted this; false = paid from the account
  paidBy: string | null;         // member who fronted it; MUST be null when isPrePaid == false
  categoryId: string;            // defaults to "other"
  splitMode: "equal" | "exact" | "percent";  // "equal" is the form default
  participants: string[];        // the members it is split among; ordered, defines remainder order
  splitEntries: SplitEntry[];    // raw intent, parallel to participants
  sharesMinor: Record<string, number>;  // materialised per-member amounts; sum MUST equal amountMinor.
                                      // These are the members' transfers into the account.
  excluded: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};
```

### Field notes

**The `isPrePaid` / `paidBy` invariant:** `isPrePaid == (paidBy !== null)`. Enforced in the Zod schema
and in the Firestore rules. `paidBy` is the member who fronted the money; when `isPrePaid` is false the
expense was paid from the household account and `paidBy` is `null`. A pre-paid expense's `paidBy` need
not be one of its `participants` — Alex may front a bill she shares with others without counting
toward her own consumption.

**`sharesMinor` is denormalised onto the expense:** the resolved per-member amounts are stored at write
time, so historical figures can never change if the split algorithm is later revised, and balances need
no recomputation of past expenses.

**`totalAmountMinor` and `expenseCount` are denormalised onto the period:** the period table needs a
total per row and Firestore has no joins. Recompute and write both in the **same `writeBatch`** as any
expense create/update/delete so the table can never drift from its expenses. This includes
`excluded` expenses being excluded from the total and count.

**`date` is validated against the period's range,** inclusive of both endpoints. Because periods may
overlap, an expense belongs to exactly one period and is never queried by date alone.

### Firestore layout

```text
households/{householdId}                                  name, memberUids[], settings,
                                                          schemaVersion, createdAt, updatedAt
households/{householdId}/members/{memberId}               name, avatar, colorHex, archived, timestamps
households/{householdId}/periods/{periodId}               full ExpensePeriod document
households/{householdId}/periods/{periodId}/expenses/{eid} full Expense document
households/{householdId}/meta/categories                  { categories: [{id,label,icon,colorHex}] }
shareLinks/{token}                                        { householdId, periodId, createdAt, updatedAt }
```

Expenses live in a subcollection **of the period**, so opening a period is one collection query and
rules can scope writes to that period. The consequence is accepted: reading expenses across all
periods would need a `collectionGroup` query, which the app does not do — every expense is always
viewed within its own period.

### Composite indexes (`firestore.indexes.json`)

| Collection | Fields | Serves |
|---|---|---|
| `periods` | `status ASC, startDate ASC` | period table filtered by status, default sort |
| `periods` | `startDate ASC` | period table default sort, unfiltered |
| `periods/{p}/expenses` | `date ASC` | expense table, default sort |
| `periods/{p}/expenses` | `isPrePaid ASC, date DESC` | filter to pre-paid or account-paid only |
| `periods/{p}/expenses` | `amountMinor DESC` | sort by amount |

Single-field `name` and `startDate` on `periods` are automatic.

---

## 4. Split engine, balances, and settlement rounding

Pure module. This is the correctness core — build and test it before any UI.

### `computeShares`

Returns each participant's amount for one expense. **Those amounts are the money each member owes into
the household account for that expense** — the split and the transfer obligation are the same number,
not two separate calculations. `equal` is the default mode the form pre-selects.

```ts
computeShares({
  amountMinor: number,
  mode: "equal" | "exact" | "percent",
  participants: string[],       // ordered
  entries: SplitEntry[],
}): { shares: Record<string, MinorUnits> }
```

Invariant, asserted before returning and in tests: `sum(shares) === amountMinor`, always.

### Modes

There are exactly three. There is no weight-based or "shares" mode.

- **equal** (default) — `base = floor(amount / n)`, `r = amount - base * n`; the first `r`
  participants in `participants` order each get `base + 1`.
- **exact** — validate `sum(valueMinor) === amountMinor`. No rounding. The form blocks save and shows
  the delta ("$4.00 unassigned" / "over by $1.50").
- **percent** — each gets `round(amount * bps / 10000)`; the resulting ±1 residual is distributed by
  descending fractional part, ties by `participants` order. Percentages are stored as basis points and
  must sum to exactly 10000.

### Rounding within a split

- Integer cents only. Floats may be used to rank fractional parts, never to produce a stored value.
- Amounts always have two decimal places; there is no per-currency exponent.
- When a split is uneven by one cent, show a short note ("Alice got the extra cent"). Nobody should
  have to trust the maths.

### Member balance against the household account

```text
netConsumed[m] = Σ sharesMinor[m]  over expenses where m ∈ participants
netFronted[m]  = Σ amountMinor     over expenses where isPrePaid && paidBy == m

toAccountExact[m] = netConsumed[m] - netFronted[m]
```

Excluded expenses contribute to neither sum.

Note what makes this correct: a pre-paid member has *already supplied* the account with that money, so
it cancels against what they consumed. A member who fronted an entire expense larger than their own
share ends up with a negative `toAccountExact` and is reimbursed the difference.

### Settlement rounding (end of period)

When a period is settled, each member's transfer is rounded to a **whole dollar**:

```text
toAccountSettled[m] =
  toAccountExact[m] > 0  ? ceilWholeDollars(toAccountExact[m])     // member pays up
  : toAccountExact[m] < 0  ? floorWholeDollars(toAccountExact[m])  // account reimburses down
  : 0

ceilWholeDollars(c)   = Math.ceil(c / 100) * 100
floorWholeDollars(c) = (c < 0 ? -1 : 1) * Math.floor(Math.abs(c) / 100) * 100
```

- **Amounts the member owes are rounded UP.** A member owing $0.40 transfers $1.00.
- **Amounts the account owes the member are rounded DOWN.** A member owed $40.60 is reimbursed
  $40.00. The account is never disadvantaged in either direction.
- **`floorWholeDollars` must floor the magnitude and reapply the sign.** `Math.floor(c / 100) * 100`
  is wrong for negatives: `Math.floor(-40.6)` is `-41`, so a $40.60 reimbursement would become
  $41.00 — rounding *away* from zero and making the account pay more than it owes. This is the
  opposite of the intended rule.
- **Normalise negative zero.** `floorWholeDollars(-1)` is `0`, not `-0`, so equality checks and
  display never see a negative zero. Return `0` explicitly when the result is zero.
- `$0` stays `$0`; both helpers return 0 for 0. `ceilWholeDollars` is only ever applied to positive
  amounts, so its behaviour on negatives is not relied upon.
- Roundings are applied **per member, independently**. The sum of the rounded amounts will generally
  not equal the sum of the exact amounts — it will exceed it by up to `(n - 1)` whole dollars for `n`
  members, which is intentional. **This is a display-and-transfer rounding, not a data-integrity
  problem: never "correct" it by adjusting a member's share.** The exact per-member figures are
  derived on demand from `sharesMinor` and are not stored rounded.
- The account's own funding line (§5, settlement card) is ceiled the same way.

### The funding invariant

```text
Σ_m toAccountExact[m] = totalSpend - totalPrePaid
```

where `totalSpend` is the sum of `amountMinor` over all non-excluded expenses in the period and
`totalPrePaid` the sum over those with `isPrePaid`. The right-hand side is what the household account
must fund from its own money. Assert this in development against the **exact** figures; a mismatch
means `sharesMinor` or `isPrePaid` is corrupt. It does not apply to the rounded figures, per the
rounding rules above.

Unlike a member-to-member settlement, this sum is **not** expected to be zero, and it must never be
displayed as if it were — show it as a distinct, correctly-labelled figure (§5).

### There is no member-to-member settlement

Do not implement any debtor/creditor optimisation. Each member owes the account, or is owed by the
account; members never owe each other.

### Error cases to handle explicitly

Zero participants; `amountMinor <= 0`; percentages ≠ 10000 bps; exact amounts ≠ total; `isPrePaid`
true with `paidBy` null (or the reverse); a `paidBy` that is not an existing member; an expense `date`
outside its period's range; adding an expense to a `settled` period; a period with `endDate <
startDate`; a duplicate period name; a participant who no longer exists — render as "Removed member"
and flag the row, **do not drop it** (balances stay correct because `sharesMinor` is already
materialised); a pre-payer who was since removed — count the `netFronted` credit as normal and display
their name as "Removed member"; a float amount with more than two decimals (reject `"1.005"`).

---

## 5. Screens and flows

### Routes

| Route | Purpose |
|---|---|
| `/` | Home: the expense period table, with status filter and create button |
| `/period/[periodId]` | One period: its expense table, add-expense form, settlement summary, settle/reopen |
| `/share/[token]` | Share landing: the linked period directly, or the shared list (§7) |
| `/share/[token]/periods` | Shared list: every period plus the household panel, read-only (§7) |
| `/share/[token]/period/[periodId]` | One shared period: expenses and settlement, read-only (§7) |

### F1 — first run

There is no setup route and no "start new household" button. The app holds exactly one household
per installation, so the first run is a dialog on `/`, not a separate destination.

- After the silent anonymous sign-in (§7), `/` checks for the household document. If it exists,
  the expense period table renders directly (F2), and the members persisted at setup are already
  available to assign to expenses.
- If no household document exists — Firestore is empty for this uid — `/` opens a **first-run
  setup dialog**: a centred modal on desktop, a full-screen sheet on mobile. It asks for the
  household name and at least two members (inline, live avatar preview). It asks for no currency.
- **Continue** creates the household document and the member documents, closes the dialog, and
  reveals the period table. The dialog appears only while the household document is missing; there
  is no button, link, or route that opens it once a household exists. Starting over means clearing
  site data, which issues a fresh anonymous uid and therefore a fresh, empty household (see the
  accepted risks in §7).

### F2 — the home page: expense periods

`/` always renders the period table, which is the app's landing page. It has:

- A page header reading **"Expense periods for {household name}"**, with the
  **"Create expense period"** button (always visible) and the **theme toggle**
  beside it — an icon-only button (Sun offers light while dark is active and
  vice versa), not a text label.
- A **status filter** above the table, as a dropdown: `All periods` (default) / `In progress` /
  `Settled`, each showing its count.
- A table with these columns, in this order:

| # | Column | Content |
|---|--------|---------|
| 1 | Name | `name`, rendered as a link to `/period/[id]` |
| 2 | Start date | `startDate`, formatted `MMM D, YYYY`; sortable |
| 3 | End date | `endDate`, same format |
| 4 | Total expense amount | `totalAmountMinor` as `$X,XXX.XX` |
| 5 | Status | a `StatusBadge`: `In progress` or `Settled` |
| 6 | Actions | a delete button (see F9) |

- **Start date is the only sortable column here.** Default `startDate` ascending; clicking the header
  toggles ascending/descending. Name, End date, Total, Status and Actions are not sortable — the
  expense table (F4) is where Name and Amount sorting lives. Do not render a sort control on the Total
  header.
- Rows are clickable via the Name link. `0` periods is not a special error state — the table body shows
  an empty-state row ("No expense periods yet") **and** the header's "Create expense period" button
  remains visible and is the primary call to action.
- Below the table, a **household panel** shows the household name (large), the member list, and an
  **"Add member"** button. Each member row shows the avatar and the name; clicking a name turns
  it into a textbox for inline rename (Enter or blur saves, Escape cancels; empty and duplicate
  names are rejected inline, duplicates compared case-insensitively against every member).
  The panel is the only post-setup place members are added or renamed.

### F3 — create an expense period

Clicking "Create expense period" opens a dialog with:

- **Name** — text input, required, 1–60 chars, unique case-insensitively within the household.
- **Start date** — dropdown date picker (shadcn `Popover` + `Calendar`).
- **End date** — dropdown date picker. Must be on or after the start date.

Clicking **OK** creates the document with `status: "in_progress"`, `totalAmountMinor: 0`,
`expenseCount: 0`, `settledAt: null`, closes the dialog, and returns to the period table, where the
new period is visible as a row. The user opens it by clicking its name. Overlap with an existing
period is **allowed** and must not block creation — validate only `endDate >= startDate` and reject
only a duplicate name.

### F4 — open a period: the expense table

Clicking a period's name navigates to `/period/[periodId]`, showing that period's header (inline-editable
name, date range, total, `StatusBadge`) above a **table of expenses** with these columns, in this order:

| # | Column | Content |
|---|--------|---------|
| 1 | Date | `date`, formatted `MMM D, YYYY`; sortable |
| 2 | Name | `name`; opens the edit form when clicked; sortable |
| 3 | Description | `description`, or an em dash when empty |
| 4 | Prepaid | the fronting member's name for a pre-paid expense (`paidBy`; "Removed member" if they have since been removed) — or `No` |
| 5 | Mode of split | `Equal` / `Exact` / `Percentage` |
| 6 | Amount | `amountMinor` as `$X,XXX.XX`; sortable |
| 7 | Actions | a delete button (see F9) |

- **Date, Name and Amount are sortable, one column at a time.** Clicking a header sorts by that column
  ascending; clicking the active header flips the direction. The active column's arrow is filled and
  inactive arrows are dimmed, so the sort state is visible without relying on colour alone. Default is
  `date` ascending. Description, Prepaid, Mode of split and Actions are not sortable.
- Sort must be **stable**: rows with equal keys fall back to comparing `id`, so re-sorting never
  shuffles equal rows between renders.
- An empty period shows a designed empty state, not a blank table.

An **"Add expense"** button in the page header opens the form (F5). Members are added from the
home page panel (F2), not here. Clicking an expense's name opens
the same form pre-filled for editing. Deleting an expense is **permanent and always confirmed** — see
F9; there is no undo.

The period name in the header is **editable inline**: click it and it becomes a textbox. Enter or blur
saves, Escape cancels. It rejects an empty name, a name over 60 characters, and a name another period
already uses (case-insensitively, excluding this period's own current name). Rename is disabled while
the period is settled.

If the period is `settled`, the add/edit/delete controls and the table rows are read-only, and a
**Reopen period** button is shown in the header (F6). While a period is `in progress` its page
keeps the Expenses and Settlement tabs (the add form and the settle action live there); once it is
settled the tabs are dropped and the page renders the restructured layout described at the end of
F6 — settled amounts at the top, the expense table below.

### F5 — add an expense

Full-screen sheet on mobile, centred modal on desktop, with these fields:

- **Date** — dropdown date picker, defaults to today. The min is the period's start date and the max
  is its end date, and **out-of-range days are disabled in the calendar itself**, not merely rejected
  on submit. The repository also enforces the range on write (§7), so the rule holds regardless of
  how the value arrives.
- **Name** — required, 1–60 chars.
- **Description** — optional, up to 280 chars.
- **Amount** — required, `inputMode="decimal"`, parsed to cents; reject more than two decimals.
- **Prepaid** — a single `Prepaid by a member` checkbox. Unchecked means paid from the household
  account. Checked reveals a **"Fronted by" dropdown**. The two are never independently editable:
  checking Prepaid sets `isPrePaid: true, paidBy: <selected>`, and unchecking sets `isPrePaid: false,
  paidBy: null`. This is the only way `isPrePaid` and `paidBy` are edited, so the invariant in §3
  cannot be broken by the user.
- **Mode of splitting** and the participant list are **shown only when the expense is not pre-paid**.
  When pre-paid, the entire split section is hidden and the expense is split **equally across every
  non-archived member**. The maths is unchanged from §4: the account reimburses the fronting member
  the full amount and their own share cancels against it, so a $90 shop fronted by Alex and shared
  with Sam yields **Alex −$45, Sam +$45**. A pre-paid expense is a reimbursement, not a write-off —
  the household's consumption still counts.
  When not pre-paid: `Mode of splitting` is a **dropdown** (`Equal` default / `Percentage` / `Exact`),
  since the modes are mutually exclusive and a list reads better than a toggle group. Participants are
  a **checkbox per member**, all checked by default, independent of who pre-paid it.
  Choosing `Percentage` or `Exact` reveals a per-member input for each participant, **initialised from
  the equal split** so it is adjusted rather than typed from scratch. Percentages must total 100% and
  exact amounts must total the expense total.
- A **live preview** lists each participant's resulting amount, labelled as the amount they owe into
  the account for this expense, with an "assigned $X of $Y" indicator that turns green when balanced.
  Saving is blocked while unbalanced, with the delta shown.
- When pre-paid, a **reimbursement summary** replaces the split preview: "The account will reimburse
  Alex $90.00. Their own share of $45.00 is already covered, so their balance moves by −$45.00."

Clicking **Create** (or **Save** when editing) writes the expense, updates the parent period's
`totalAmountMinor` and `expenseCount` in the same batch, closes the form, and shows the new row in
the table. `Cmd/Ctrl+Enter` submits. Validation failures are shown inline next to the offending field.

### F6 — settle a period

A **Settlement card** on the period page, headed "{household name} — <period name>" (the name
given at setup), containing:

- A **funding line** for the account's own requirement, ceiled to whole dollars:
  "The account must cover $X of the $Y spent in this period". This is not a member's debt and must not
  be presented as one.
- One row per member with a non-zero transfer, sorted by magnitude descending: avatar, name, and
  either `transfer $180 to the account` (positive) or `reimbursed $40 by the account` (negative).
  Members at zero collapse into an "All settled" line. These are the **rounded** whole-dollar figures
  from §4.
- A **copy-all** button producing plain text such as:
  `1ST split — Holiday 2026: Alex → household account $180; Sam → household account $95.`
- A **Settle period** button, enabled only when the period is `in progress`. Clicking it asks for
  confirmation, then sets `status: "settled"` and `settledAt: <now>`. The period's expenses become
  read-only, and the page switches to the settled layout below.
- On a settled period the card is read-only and shows a **Reopen period** button, which asks for
  confirmation and sets `status: "in_progress"` and `settledAt: null`. Reopening does not delete
  anything and does not alter any existing expense or transfer figure.
- Each member row shows the rounded whole-dollar transfer only — no exact-cents
  line beneath it. The rounded figures are the transfer; the exact cents stay
  in the data, not on the row.

**The settled period page.** Once a period is settled, its page stops using the
Expenses/Settlement tabs and renders a single column, top to bottom:

1. **The settled amounts section** — the settlement card above (funding line, one row per
   member with a non-zero transfer, rounded whole-dollar figures only), read-only,
   with its **Copy all** button.
2. **The expense table** under an "Expenses" heading — the same F4 table, read-only, its
   sortable headers still working. A settled period with zero expenses shows the empty
   state without the "Add one" hint.

The green "settled and read-only" banner is dropped in this layout — the `Settled` badge in
the header and the restructured page itself carry that information, and the **Reopen period**
button stays in the header (F6). An `in progress` period keeps the tabbed layout.

**Sharing.** The page header carries a **Share** button (top, next to Reopen period on a
settled period and next to Add expense on an in-progress one; owner pages only, every
status). It opens the share dialog (§7): creating a link copies a `/share/{token}` URL
that opens the household read-only on any device. There is no per-page URL copy: the
old "Copy link" button beside Copy all is removed, repurposed into Share.

### F7 — remove a member

Confirmation states the consequence explicitly: "Sam appears in 14 expenses. Removing keeps those
expenses and their split intact; the name shows as 'Removed member'." Sets `archived: true` — never a
hard delete. `archived` members are omitted from the settlement transfer list but their historical
expenses still count toward `netConsumed`.

### F8 — delete (permanent, always confirmed)

Deletion is **permanent and cannot be undone**. Every delete is behind a confirmation dialog, because
a misclick must not destroy data. The dialog names the target and the collateral.

- **Deleting an expense** — a trash button in the row's Actions cell. The dialog names the expense and
  its amount: `Delete "Groceries"? This permanently removes the $100.00 expense. This cannot be
  undone.` Deleting also updates the parent period's `totalAmountMinor` and `expenseCount` in the same
  batch, so the period table cannot drift.
- **Deleting a period** — a trash button in the period table's Actions cell and a **Delete period**
  button in the period page header. The dialog states how many expenses go with it: `Delete
  "September"? This permanently removes the period and the 12 expenses inside it.` Deleting a period
  **cascades to its expenses** — see the Firestore caveat in §8, because Firestore does not cascade
  subcollections on their own.
- Delete controls are hidden while the period is `settled`; a settled period must be reopened first.
- There is no soft delete, no `deletedAt` field, and no recycle bin. Undo is explicitly deferred; do
  not describe deletion as undoable anywhere in the UI or the docs.

### Client state

- Server state: `onSnapshot` listeners scoped to the household path, delivered by a client-only
  `<HouseholdProvider>` exposing `{ members, periods, categories, status, error }`. A second
  `<PeriodProvider>` for the open period adds `{ expenses, period }`.
- Derived state: per-member transfers, totals and the funding requirement, computed by selectors with
  `useMemo` keyed on `(members, expenses, periodId)`. **No duplicated financial state in the client
  store.**
- Table sort and status filter are local component state; the sort default is `startDate` ascending
  and the filter default is `All`.
- Drafts live in component state; the in-progress expense is mirrored to `sessionStorage` so an
  accidental refresh does not lose it.

---

## 6. UI and design

Dark-first, premium fintech feel. Light theme available, defaulting to `prefers-color-scheme`, with a
manual toggle persisted to `localStorage` under `1stsplit:theme` — an icon-only Sun/Moon button
beside "Create expense period" in the home page header.

### Tokens (CSS custom properties in `globals.css`, referenced via Tailwind v4 `@theme`)

| Token | Dark value | Use |
|---|---|---|
| `--bg` | `#0B0D12` | canvas |
| `--surface` | `rgba(255,255,255,0.04)` | cards |
| `--border` | `rgba(255,255,255,0.10)` | hairlines |
| `--text` | `#F5F7FA` | primary text |
| `--muted` | `#8A93A6` | secondary text |
| `--accent` | `#6366F1 → #A855F7` gradient | primary actions, focus rings |
| `--positive` | `#34D399` | member must transfer into the account |
| `--negative` | `#FB7185` | account must reimburse the member |
| `--warning` | `#FBBF24` | validation, remainder notes |

Status badge colours: `in progress` uses the accent tint, `settled` uses `--positive`.

Member palette (assign by stable hash of `memberId` so a member keeps their colour across devices):
`#F87171 #FB923C #FBBF24 #4ADE80 #34D399 #22D3EE #60A5FA #818CF8 #C084FC #F472B6`.

- Font: Inter or Geist via `next/font`, self-hosted, `display: swap`.
- Every currency amount uses `font-variant-numeric: tabular-nums` so table columns align.
- Amount formatting: whole-dollar settlement figures render without decimals (`$1,235`); expense and
  exact amounts render with two (`$1,235.60`). There is no currency selector anywhere in the UI.
- 8px spacing scale. Form fields use `gap-5`/`gap-6` between groups and `gap-2.5` between a label
  and its control, so fields are visually separated rather than cramped.
- **Control heights are 44px** (`h-11`) for default buttons, inputs, selects and date pickers, per the
  touch-target rule below. Checkboxes are 20px with a 44px hit area. shadcn's generated defaults
  (32px/28px) are too small and must be overridden.
- `max-w-6xl` content column. Tables become horizontally scrollable, or reflow to stacked cards,
  below `md`.

### Selection affordance

A selected control must be unambiguous without relying on colour alone:

| Control | Pattern | Selected state |
|---|---|---|
| Status filter | dropdown (`Select`) | Value in the closed trigger; check icon in the listbox |
| Mode of splitting | dropdown (`Select`) | Value in the closed trigger; check icon in the listbox |
| "Fronted by" | dropdown (`Select`) | Value in the closed trigger |
| Participants in a split | **checkbox** per member | Filled accent checkbox plus a tinted row and border |
| Prepaid | checkbox | Filled accent checkbox |

Use a dropdown wherever the options are **mutually exclusive**, and checkboxes wherever several may
be chosen at once. Do not use a row of toggle buttons for either: a filled button reads as a call to
action rather than a selected state, and its only visual difference is a fill.

### Components to build

1. **PeriodTable** — the F2 home table: Start date as the only sortable column, status filter as a
   dropdown, name link, per-row delete, empty state.
2. **StatusBadge** and **StatusFilter** — `In progress` / `Settled` badge, and the `All periods` /
   `In progress` / `Settled` filter as a dropdown above the table showing counts.
3. **CreatePeriodDialog** — name plus two dropdown date pickers (F3).
4. **ExpenseTable** — the F4 table: Date / Name / Amount sortable, per-row edit and delete, read-only
   when the period is settled. Takes the household's member list so the Prepaid column can name
   the fronting member (bare name, or "Removed member" for a fronting member who has since been
   removed, or `No`); the column stays non-sortable.
5. **AddExpenseForm** — F5, including the `Prepaid by a member` checkbox with its "Fronted by"
   dropdown, and the `Equal` / `Exact` / `Percentage` split editor — a mode dropdown plus a checkbox
   per member — with a live preview. The split section is hidden entirely while pre-paid, replaced by
   a reimbursement summary.
6. **TransferSummary** — the F6 settlement card: funding line, per-member transfer rows, copy-all,
   Settle / Reopen (disabled on a view-only share page). Sharing is not here: it lives in
   the period page header (§7), and the old Copy-link button is removed.
7. **DatePicker** — shadcn `Popover` + `Calendar`. Must use the shadcn `Calendar` wrapper, **not** a
   bare `DayPicker`: the raw component ships with no `classNames`, which renders cramped day cells.
   The caption is `captionLayout="dropdown"`, giving **separate month and year select lists** so a
   distant year is one click rather than dozens of arrow presses. The year list spans 2020–2030. An
   optional min/max range disables out-of-range days — `startMonth`/`endMonth` alone only clamp
   *navigation* and still allow selecting an out-of-range day. With no value selected the calendar
   opens on the current month, clamped into range (defaulting to the range's first month instead
   would drop every user into e.g. January 2020).
8. **InlinePeriodName** — the period name in the period page header is a button that turns into a
   textbox on click. Saves on Enter or blur, cancels on Escape, and rejects an empty name, a name
   over 60 characters, or a name another period already uses. Disabled while the period is settled
   or the page is a view-only share.
9. **ConfirmDeleteDialog** — deletion is permanent, so every delete asks first and the dialog names
   the collateral ("this also deletes the 12 expenses inside it").
10. **Toasts** — bottom-centre on mobile, bottom-right on desktop. Reserved for non-destructive
    confirmations; **not** used to offer Undo for a delete (F8).
11. **HouseholdSetupDialog** — the F1 first-run modal (shadcn `Dialog`, full-screen sheet on
    mobile): household name input plus ≥2 member inputs with live avatar preview, and a
    **Continue** action that creates the household and its members. Rendered by the home page only
    while no household document exists; no button or route opens it otherwise.
12. **AddMemberDialog** — post-setup member creation from the home page panel: one name
    input with live avatar preview, duplicate rejection, and an **Add** action that creates the
    member and refreshes the household's member list. Past expenses are untouched; the new
    member joins every future split with a zero balance so far.
13. **MemberList** — the home page member list: one row per member with avatar and name;
    clicking a name edits it inline (Enter/blur saves, Escape cancels, duplicates rejected).
    On a view-only share page the names render as plain text with no rename affordance.
14. **ShareDialog** — the §7 share manager (period page header, owner pages only, every status):
    creates bearer-secret links pinned to the open period (copying the `/share/{token}` URL on
    creation), lists live links with creation dates, and revokes with per-row Copy/Revoke.
    Links never expire.
15. **SharedShell + ViewOnlyBanner** — resolves `/share/{token}` to its household and renders
    the linked period directly (or the shared list for period-less links) inside a read-only
    household provider (`readOnly`, period links prefixed `/share/{token}`, back link to the
    shared list), under a banner naming the mode; unknown/revoked tokens get
    the invalid-link state instead of data.

### Guarding the shadcn primitives

`npx shadcn@latest add <component>` **overwrites** existing files in `src/components/ui/` with the
upstream registry versions. That silently reverts local edits — in particular the 44px control sizing
above, which the registry does not ship. Keep a small guard test that asserts the required size
classes are still present in `button.tsx`, `input.tsx`, `select.tsx` and `checkbox.tsx`, so a future
`shadcn add` fails the suite instead of quietly shrinking every control.

### Categories

Seed a default list in `meta/categories`: Groceries, Utilities, Rent, Transport, Dining, Household,
Health, Entertainment, Other. Each with an icon and a colour. The expense form exposes category as an
optional field defaulting to `other`; it is not a required column of the expense table.

### Accessibility

WCAG 2.1 AA, and part of the definition of done:
- Full keyboard path through create-period, add-expense, save, settle, reopen, rename (period and
  member), share dialog,
  delete, and dialog close (`Esc`).
- The period and expense tables are real `<table>` markup with `<th scope="col">` headers, so column
  association survives; a row is opened via a link/button inside the name cell rather than a click
  handler alone, so it is reachable by keyboard.
- Sortable headers are real `<button>`s with an accessible name like `Sort by date`, and the active
  column is conveyed by the arrow plus text, not colour alone.
- The Actions column header is visually empty but must carry a screen-reader label (e.g. an
  `sr-only` "Actions").
- Focus trapped in dialogs, restored to the trigger on close, visible `:focus-visible` ring everywhere.
- Text contrast ≥ 4.5:1, UI borders ≥ 3:1, in both themes.
- Colour is never the only signal — status badges carry text, and every transfer row says "transfer"
  or "reimbursed" in words.
- `aria-live="polite"` on toasts, on the settlement summary, and on the expense form's live split
  preview, so balance changes and validation deltas are announced.
- Touch targets ≥ 44×44px (§6 control heights).
- Responsive 360px → 1920px with no layout breaks.

---

## 7. Persistence and the no-auth model

### How a household is identified with no login

```
first visit
  → no id in localStorage
  → signInAnonymously()      (silent; no UI, no credential, no sign-out)
  → the returned uid becomes the household document id
  → persist id + a 128-bit join secret to localStorage
  → ready
  → households/{uid} exists?
      yes → `/` renders the period table (F2); the members stored at setup
            are already there and assignable to expenses
      no  → Firestore is empty for this household → `/` opens the first-run
            setup dialog (F1): household name + ≥2 members → create → period table
```

This is the load-bearing decision. Without it, either the Firestore rules are open (anyone can read
and destroy any household) or the data is unreachable. `signInAnonymously` satisfies "no login" from
the user's perspective while giving rules something real to authorise on. Nothing in the UI mentions
authentication.

The Firebase web API key is not a secret and is correct in `NEXT_PUBLIC_*` variables. There are no
other secrets in v1.

### Storage

| Key | Value |
|---|---|
| `1stsplit:householdId` | household document id |
| `1stsplit:theme` | `dark \| light \| system` |
| `1stsplit:lastPeriodId` | last opened period, for return-visit UX |
| `1stsplit:draftExpense` | `sessionStorage`, cleared on save |

Share tokens are **not** kept in storage: they live in the top-level `shareLinks`
collection in Firestore, so listing and revoking them works from any device and
there is nothing bearer-secret-shaped in `localStorage` to steal.

If storage is unavailable (private mode), fall back to in-memory and show a non-blocking banner that
the session will not be saved.

### View-only share links (the multi-device story)

`households/{id}.memberUids: string[]` exists from day one, as a single-element array, and
writes are authorised on `request.auth.uid in resource.data.memberUids`. Share links need
no rules change to the write path and no data migration.

A share link is a document in the top-level **`shareLinks/{token}`** collection, where the
document id **is** the token: a 128-bit base64url bearer secret generated by `newJoinSecret`.
The document holds `{ householdId, periodId, createdAt, updatedAt }` — `periodId` pins the
landing page to the period the link was created from (null only for links written before
pinning existed). The share URL carries only the token: `{origin}/share/{token}`.

- **Creating** a link (the Share button in the period page header, owner pages only, every
  status) writes the document with the open period's id and copies the URL. The dialog lists
  every live link with its creation date, each with Copy and Revoke.
- **Opening** `/share/{token}` resolves the token and lands **directly on the linked
  period** — a settled period shows its transfers at the top with no clicks needed. The
  period page's back link goes to the shared list at `/share/{token}/periods` (period table
  + household panel, read-only), so every other period stays one click away; direct
  period URLs live at `/share/{token}/period/[periodId]`. A link with no period lands on
  the list instead.
- **Read-only is two layers.** The UI layer: a `readOnly` flag on the household context
  renders every write control **disabled, not hidden** (Create expense period, Add member,
  Add expense, Settle/Reopen, Delete, inline renames of periods and members), keeps
  navigation, sorting, filtering, and Copy all working, and period links carry the
  `/share/{token}` prefix so a visitor can browse every period without ever leaving the
  shared view, and a `homePath` so the period back link reaches the shared list. The rules layer: reads of the household subtree are open to any signed-in
  user (the household and period ids are themselves unguessable, which is what makes an
  unlisted link unguessable), while **every write stays member-only** — a visitor's
  anonymous uid is not in `memberUids`, so the rules deny their writes even if the UI
  did not. Top-level `households` listing is denied outright, so households cannot be
  enumerated; only single-document gets are open.
- **Links never expire; revoking is deleting the document.** The revoked-link page says
  the link is invalid or revoked and links back to `/`.

### Accepted risks

- Anyone holding a share link — or, equivalently, anyone who already knows an unguessable
  household id (e.g. from browser devtools before the link was revoked) — can read that
  household. Revoking stops the link, not a saved id. Accepted for a personal-scale app,
  same as console access below.
- Clearing site data loses access on that device until a share link is opened there.
- No attribution — "who added this" is not recorded, so there is no audit trail.
- Because periods may overlap, the same real-world date can be counted in two periods. This is
  intended (periods can have different purposes), and the UI must make each period's own scope
  unambiguous so the user is not misled into thinking the app totals a calendar month.
- Firebase console access exposes all households. Accepted for a personal-scale app.

### Rules requirements

Rules are in §8. Additionally:
- Validate on write: `name` length, `endDate >= startDate`, `amountMinor` a positive int,
  `date` matching `^\d{4}-\d{2}-\d{2}$`, `splitMode` in the enum, `participants` non-empty with no
  duplicates, `sharesMinor` values summing to `amountMinor`.
- `isPrePaid` is a bool and `isPrePaid == (paidBy != null)`. A pre-paid expense's `paidBy` is not
  required to be in `participants`.
- Referential: every id in `participants` must be an existing member document in the same household;
  `paidBy`, when non-null, must be an existing member document.
- **An expense's `date` must fall within its own period's `[startDate, endDate]`,** and **expense
  writes must be rejected while the parent period's `status == "settled"`.** Reopening the period is
  what makes writes legal again.
- A period's `totalAmountMinor` and `expenseCount` may only be written alongside an expense mutation in
  the same batch, never on their own.
- `createdAt == request.time` on create; `createdAt` immutable on update.
- Deny-by-default. No `if true` anywhere.
- Share links: `shareLinks/{token}` allows `get` to any signed-in user, allows `list`
  only to members of each listed document's household, denies `update`, and allows
  `create`/`delete` only to members of the link's household
  (`{ householdId, periodId, createdAt, updatedAt }` shape with `periodId` null or an
  existing period of that household, `createdAt == request.time` on create). Reads of
  the household subtree allow any signed-in user; every write path still requires
  membership. Top-level `households` listing is denied.

### Deleting a period does not cascade in Firestore

Deleting `periods/{periodId}` removes only that document. Its `expenses` subcollection documents are
**orphaned, not deleted** — Firestore has no cascading delete, and Security Rules cannot delete
children on the parent's behalf.

Therefore the delete must be implemented client-side in two steps:

1. Delete every document in `periods/{periodId}/expenses`, batched at ≤400 writes.
2. Delete `periods/{periodId}`.

The period document must be deleted **last**, so an interrupted delete leaves the period visible with
whatever expenses remain rather than hiding a period that still has data. A test must assert that
deleting a period with N expenses leaves zero expense documents behind.

Rejecting a period delete outright (forcing the user to empty it first) is an acceptable alternative
and avoids orphans entirely. Whichever is chosen, state it here and keep the UI dialog text in F8 in
sync.

---

## 8. Firebase

| Product | Use |
|---|---|
| **App Hosting** | Hosts Next.js on Cloud Run behind a CDN, with rollouts and rollback |
| **Firestore** | All data; realtime, offline-cached |
| **App Check** | The security control that makes the no-auth model safe |
| Auth | Anonymous sign-in only, silently (§7) |
| Storage, Functions, classic Hosting | Not used |

App Hosting, not classic Firebase Hosting: no `firebase.json` hosting rewrites and no `next.config`
`__firebaseAppName` plumbing; App Hosting is Google's recommended target for server-rendered Next.js.

### One-time setup

1. Create a Firebase project. **Blaze billing is required** — App Hosting is not on the free tier.
2. `npm i -g firebase-tools` → `firebase login`.
3. `firebase init` → select **Firestore** and **App Hosting**.
4. Choose the Firestore region closest to the household (e.g. `europe-west1`). This is permanent once
   data is written.
5. `firebase apphosting:backends:create` → returns the backend id.
6. Put the web app config (Firebase console → project settings) in `.env.local`; commit
   `.env.local.example` with empty values.
7. Enable **App Check** (reCAPTCHA Enterprise) and register both `*.web.app` and any custom domain in
   its allowed-domains list, **before** enforcing it on Firestore and Auth.

### `apphosting.yaml` (repo root)

```yaml
runConfig:
  cpu: 1
  memoryMiB: 512
  concurrency: 80
  minInstances: 0
  maxInstances: 10

env:
  - variable: NEXT_PUBLIC_FIREBASE_API_KEY
    value: "AIza..."
    availability: [BUILD, RUNTIME]
  - variable: NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
    value: "1stsplit.firebaseapp.com"
    availability: [BUILD, RUNTIME]
  - variable: NEXT_PUBLIC_FIREBASE_PROJECT_ID
    value: "1stsplit"
    availability: [BUILD, RUNTIME]
  - variable: NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
    value: "1stsplit.firebasestorage.app"
    availability: [BUILD, RUNTIME]
  - variable: NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
    value: "000000000000"
    availability: [BUILD, RUNTIME]
  - variable: NEXT_PUBLIC_FIREBASE_APP_ID
    value: "1:000000000000:web:abcdef"
    availability: [BUILD, RUNTIME]
  - variable: NEXT_PUBLIC_FIREBASE_APPHOSTING_BACKEND_ID
    value: "1stsplit"
    availability: [BUILD, RUNTIME]
  - variable: NEXT_PUBLIC_USE_FIREBASE_EMULATORS
    value: "false"
    availability: [BUILD, RUNTIME]
```

Two rules that must not be broken:
- **`NEXT_PUBLIC_*` requires `availability: [BUILD]`.** Next.js inlines these into the client bundle at
  build time. A `RUNTIME`-only value is `undefined` in the browser. This is the most common App Hosting
  + Next.js misconfiguration.
- Reserved prefixes cannot be set: `FIREBASE_`, `EXT_`, `NODE_`, `X_GOOGLE_`, `CLOUD_`, `GCLOUD_`,
  `SERVICE_`, `GOOGLE_`, `WEB_`.

v1 needs no secret parameters. When one is added, reference Cloud Secret Manager with
`secret: <name>` (or `secret: <name>@5` to pin a version) — never a literal value.

`apphosting.staging.yaml` overrides for a staging backend on a **separate** project/database.
`apphosting.local.yaml` is auto-created by the CLI, contains no secrets, and is committed.

### `firestore.rules`

```text
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isMember(hid) {
      return request.auth != null
        && request.auth.uid in get(/databases/$(database)/documents/households/$(hid)).data.memberUids;
    }
    match /households/{hid} {
      allow read, write: if isMember(hid);
      match /members/{id}   { allow read, write: if isMember(hid); }

      match /periods/{pid} {
        allow read, write: if isMember(hid);

        // Expenses are writable only while the period is in progress.
        match /expenses/{eid} {
          allow read: if isMember(hid);
          allow create, update, delete: if isMember(hid)
            && get(/databases/$(database)/documents/households/$(hid)/periods/$(pid)).data.status
               == "in_progress";
        }
      }
      match /meta/{id} { allow read, write: if isMember(hid); }
    }
  }
}
```

Plus the validation, referential and date-range requirements in §7. Unit tests must prove that an
unauthenticated read is denied, that a user outside `memberUids` is denied, and that an expense write
against a `settled` period is denied while the same write against an `in_progress` period succeeds.

### Firebase client (`src/lib/firebase/client.ts`)

One module: read `process.env.NEXT_PUBLIC_*`, `initializeApp` once, then
`initializeFirestore(app, { localCache: persistentLocalCache({ tabManager:
persistentMultipleTabManager() }) })`. The emulator connection block runs only when
`NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true"` and must be tree-shaken out of production builds.

### Cost and quota posture

- Firestore free tier (50k reads/day, 20k writes/day) comfortably covers a household at ~80 expenses
  per period. App Hosting itself still requires Blaze — set a Cloud Billing budget alert.
- One `onSnapshot` per collection for the active screen; no per-row reads, no polling.
- Any bulk import must chunk into `writeBatch`es of ≤ 400 (Firestore's hard limit is 500).

### `firebase.json`

```json
{
  "firestore": { "rules": "firestore.rules", "indexes": "firestore.indexes.json" },
  "emulators": {
    "auth":       { "port": 9099 },
    "firestore":  { "port": 8080 },
    "appCheck":   { "port": 9199 },
    "ui":         { "enabled": true, "port": 4000 },
    "appHosting": { "port": 5000 },
    "singleProjectMode": true
  }
}
```

The `apphosting` key is added automatically by `firebase init apphosting`.

### Deploy

```bash
npm run lint && npm run typecheck && npm test && npm run build
firebase deploy --only firestore
firebase deploy --only apphosting
```

Pre-flight:
- [ ] `engines.node` matches the App Hosting build image; `package-lock.json` committed; the build
      needs dev dependencies
- [ ] Nothing required at build time lives only in `.env.local` — App Hosting sees the repo plus
      `apphosting.yaml` only
- [ ] `next.config` output left at default; App Hosting sets `standalone` itself
- [ ] Blaze enabled; Firestore region chosen; rules and indexes deployed
- [ ] App Check domains registered **before** enforcement
- [ ] Smoke-test the deployed build, then test a rollback

Prefer GitHub-connected CI/CD from the App Hosting console for anything past a prototype: it builds on
push and promotes `main` to the live channel, with one-click rollback.

### Local development

```bash
npm run dev                  # Next dev server :3000
firebase emulators:start     # Firestore :8080, Auth :9099, App Check :9199, App Hosting :5000
npm run seed:emulator        # demo household: 5 members, 3 periods, ~30 expenses
```

The Firestore emulator is mandatory locally — rules and indexes are only testable against it, and it
keeps local data off production.

---

## 9. Testing

| Layer | Tool | Target |
|---|---|---|
| Split engine | Vitest | **100%** — the three modes × every rounding edge case (amount 0, 1, 999/3, 100/3), boundary lengths; equal mode is the default and must always balance; percentages must total 10000 bps |
| Settlement rounding | Vitest | **100%** — $0.40 → $1.00; $40.60 reimbursement → $40.00; $0 stays $0; $100.00 unchanged; negative zero; the sum of rounded figures exceeding the exact sum is asserted, not corrected |
| Member balance selector | Vitest | the worked example: consumed 300, fronted 120 → 180; a pre-paid expense whose payer is *not* a participant; a pre-payer later archived; all-fronted and none-fronted periods; excluded expenses contribute to neither sum |
| Funding invariant | Vitest | `Σ toAccountExact == totalSpend - totalPrePaid` across randomised fixtures, on exact figures |
| Period logic | Vitest | `endDate < startDate` rejected; overlapping periods allowed; duplicate name rejected; an expense dated outside its period rejected; settle then reopen round-trips status and `settledAt` |
| Period totals | Vitest | `totalAmountMinor` / `expenseCount` stay consistent with the expenses across create, edit, delete and `excluded` |
| Money formatting/parsing | Vitest | `$1,234.56`; whole-dollar `$1,235`; reject `"1.005"`; reject `"abc"`, `""`, negative |
| Expense sorting | Vitest | `sortExpenses` orders by date, name and amount in both directions; equal keys fall back to `id` so the order is deterministic |
| Date picker | Vitest + Testing Library | the calendar exposes two caption dropdowns (month, year); the year list spans 2020–2030; out-of-range days are disabled; an empty picker opens on the current month; choosing a day emits an ISO date |
| Firestore rules | `@firebase/rules-unit-testing` | unauthenticated read denied; non-member read/write denied; bad `amountMinor`/`name`/`participants` rejected; `isPrePaid` true with null `paidBy` (and the reverse) rejected; expense `date` outside the period rejected; **expense write to a `settled` period rejected** and the same write to an `in_progress` period allowed; `createdAt` mutation rejected; cross-household write denied |
| UI guard | Vitest | the shadcn primitives still carry the 44px size classes, and no animation library is present (§6) |
| Components | Vitest + Testing Library (jsdom) | period table columns, default sort, status filter and empty state; create-period dialog; **period delete with and without confirming, and the cascade to expenses**; **inline rename, including rejecting a duplicate name**; **expense sorting on each of the three columns in both directions**; **expense delete behind a confirmation**; the `Prepaid by a member` checkbox hiding the whole split section; **a pre-paid save persisting as an equal split with a negative balance for the fronting member**; all three split modes; the live preview blocking an unbalanced save; settlement card; settle and reopen; **the Prepaid column naming the fronting member (bare name) and "Removed member" for a since-removed fronting member**; **the settled period page: settled amounts above the expense table with no tabs, and the tabbed layout with the Share button on the in-progress page**; **adding a member from the home page, rejecting a duplicate name, inline member rename (save, duplicate rejection), and the "Expense periods for {household}" header**; **share links: create + copy URL from the Share dialog, revoke, the read-only shared home and period pages with every write control disabled, the revoked-link state, and link resolution through the shell** |
| E2E | Playwright (deferred) | first-run setup dialog → create period → add a pre-paid and an account-paid expense → see transfer amounts → settle → reopen → reload → data still there |
| Accessibility | axe-core (deferred with Playwright) | zero serious/critical on `/` (including the first-run setup dialog) and `/period/[id]` |

**Test timeout.** Component tests drive real Radix primitives through `userEvent`, which is slow in
jsdom and varies with machine load. Raise the Vitest timeout to roughly 30s; the 5s default produces
spurious failures on tests that are merely slow, not broken.

`act(...)` warnings originating from Radix `Select` and `Popover` internals are expected noise from
real components in jsdom and are not failures.

Persistence-on-reload is an explicit acceptance test, not an assumption. Playwright and axe-core are
**deferred**: unit and component tests cover the behaviour without a browser download, and are the
primary gate. Add the E2E and accessibility suites once the backend lands.

---

## 10. Definition of done

**Periods**
- [ ] Home page shows the period table with Name, Start date, End date, Total expense amount, Status
      and Actions columns, default-sorted by start date ascending, with a working status filter
- [ ] Start date is the only sortable header on this table, and Total has no sort control
- [ ] With zero periods the table shows an empty state and a visible "Create expense period" button
- [ ] The create dialog takes a name plus start and end dates via dropdown date pickers, rejects
      `endDate < startDate` and duplicate names, and **allows overlapping periods**
- [ ] Date pickers offer separate month and year dropdowns (2020–2030), disable out-of-range days,
      and open on the current month when nothing is selected
- [ ] New periods open as `in progress`; the status only changes by user action
- [ ] The period name in the page header is editable inline: click to edit, Enter or blur to save,
      Escape to cancel, and a duplicate, empty or over-long name is rejected. Disabled while settled
- [ ] A period can be deleted from both the home table and its own page, always behind a
      confirmation naming how many expenses go with it, and the expenses are actually removed
- [ ] Period `totalAmountMinor` and `expenseCount` always match the underlying expenses

**Expenses**
- [ ] Clicking a period name opens its expense table with Date, Name, Description, Prepaid, Mode of
      split, Amount and Actions columns
- [ ] **Date, Name and Amount column headers are sortable**, ascending and descending, one column at
      a time, defaulting to date ascending. Equal keys fall back to a stable secondary order
- [ ] The add-expense form covers date, name, description, amount, a `Prepaid by a member` checkbox
      that reveals a "Fronted by" dropdown, and the split mode
- [ ] The split section requires a stated split, defaults to Equal with all members selected, and
      supports exactly Equal, Exact and Percentage — no weight/shares mode exists anywhere
- [ ] Each member's share is shown as the amount they owe into the account for that expense, and
      these shares are exactly what feed the period's transfer figures
- [ ] Explicit splits block saving with a visible delta until they balance; equal splits can never be
      unbalanced
- [ ] `isPrePaid` and `paidBy` can never disagree — the form exposes them as one control
- [ ] When pre-paid, the entire split section is hidden and the expense splits equally across all
      members, so a $90 shop fronted by Alex and shared with Sam settles to Alex −$45 / Sam +$45
- [ ] A reimbursement summary states the amount the account will reimburse and the fronting member's
      resulting balance, before saving
- [ ] An expense can be deleted from its row, always behind a confirmation naming the expense and its
      amount, and the period's total updates
- [ ] Every interactive control is at least 44x44px, and every selected state is identifiable
      without relying on colour alone
- [ ] Expenses cannot be added, edited or deleted in a settled period, and a reopened period accepts
      them again
- [ ] A member can be added from the home page panel; duplicate names are rejected
      and past expenses are untouched
- [ ] The home page lists every member by avatar and name, and a name can be renamed inline
      (Enter/blur saves, Escape cancels, duplicates rejected)
- [ ] The Prepaid column names the member who fronted a pre-paid expense (bare name),
      shows "Removed member" when that member has since been removed, and shows `No` otherwise

**Deletion**
- [ ] Deletion is permanent and always confirmed; no UI or documentation implies it can be undone
- [ ] Deleting a period removes its expenses, and the period document is removed last so an
      interrupted delete never hides a period that still has data

**Settlement**
- [ ] Each member shows exactly one transfer figure against the household account, computed as
      consumed minus fronted
- [ ] Owed amounts are rounded **up** to whole dollars; reimbursements are rounded **down** in
      magnitude with the sign reapplied; `$0` stays `$0` and never becomes `-0`; whole-dollar amounts
      render without decimals
- [ ] The rounded figures are presented as-is, with no exact-cents line beneath them
- [ ] The funding line is labelled as the account's own money, not a member's debt
- [ ] No member-to-member payment is shown anywhere
- [ ] Settling a period locks it; reopening unlocks it and changes nothing else
- [ ] A settled period page drops the tabs and shows the settled amounts (funding line and
      per-member transfers) at the top and the expense table below under an "Expenses"
      heading
- [ ] An in-progress period page keeps the Expenses/Settlement tabs
- [ ] Every period page (owner, any status) has a Share button in the header that opens the
      share dialog; creating a link copies a `/share/{token}` URL pinned to that period, which
      lands the visitor directly on it — a settled period shows its transfers with no clicks
      needed — while the shared list keeps every other period one click away
- [ ] A share visitor can browse the shared home and every period, with sorting, filtering,
      and Copy all working, while Create period, Add member, Add expense, Settle/Reopen,
      Delete, and inline renames all render disabled — and the rules deny those writes
      regardless of the UI
- [ ] Share links never expire; the dialog lists them with Copy and Revoke, and a revoked
      (or unknown) token shows the invalid-link state instead of data

**First run**
- [ ] With no household document in Firestore, `/` opens a centred setup dialog (full-screen sheet
      on mobile) for the household name and ≥2 members with live avatar preview; **Continue**
      creates the household and its members and reveals the period table
- [ ] On a return visit, when the household document exists, `/` shows the period table directly —
      no setup route and no "start new household" button
- [ ] Members created at setup persist, so the add-expense form can assign expenses to them

**Persistence**
- [ ] Members, periods, expenses and settings survive a full reload and a browser restart
- [ ] Firestore is the single source of truth — no financial state cached only in local storage

**Quality**
- [ ] Split engine, settlement rounding and balance selector at 100% unit coverage; rules tests green
- [ ] Lighthouse on the deployed build: performance ≥ 90, accessibility ≥ 95, best practices ≥ 90
- [ ] Zero axe serious/critical violations; full keyboard operability
- [ ] No currency selector or currency field anywhere in the UI or data; all amounts render with `$`

**Design**
- [ ] Dark and light themes both polished
- [ ] Responsive 360px → 1920px with no layout breaks; tables usable on mobile
- [ ] Loading, empty, error and storage-blocked states are designed, not placeholders

**Deployment**
- [ ] `firebase deploy` succeeds from a clean clone
- [ ] `apphosting.yaml`, `apphosting.staging.yaml`, `apphosting.local.yaml` present and correct
- [ ] App Check enforced; unauthenticated Firestore access proven denied
- [ ] Rules and indexes deployed to production; a rollback has been tested
- [ ] Budget alert set; Firestore backup schedule enabled

---

## 11. Decisions taken

These were confirmed and are already reflected above. Record any change here rather than editing
around it.

| # | Decision | Rationale |
|---|---|---|
| 1 | Silent anonymous sign-in, no user-visible auth | What makes Firestore rules safe without a login UI (§7) |
| 2 | Single household per browser; `memberUids` designed in now | Required so the share-link phase needs no migration: writes stay authorised on `memberUids` while reads open to signed-in link holders |
| 3 | **No currency setting; `$` everywhere** | The household is never asked to choose a currency, and no currency is stored |
| 4 | **Three split modes: equal (default), percent, exact** | A fourth weighting mode was judged unnecessary |
| 5 | **Settlement rounds owed amounts up, reimbursements down, to whole dollars** | Never disadvantages the household account in either direction |
| 6 | **A settled period is locked but reopenable** | A settled period is read-only with a Reopen action that returns it to `in progress` |
| 7 | **Overlapping expense periods are allowed** | A period may exist for one purpose while another covers the same weeks |
| 8 | Member removal archives, never hard deletes | Historical expenses must stay intact — note this is *member* removal and is unrelated to the permanent expense/period delete in F8 |
| 9 | **Date picker is the shadcn `Calendar` with month and year dropdowns** | A bare `DayPicker` renders cramped cells, and arrows alone make a distant date tedious. Year list spans 2020–2030 |
| 10 | **A dropdown wherever choices are mutually exclusive, a checkbox where several apply** | A row of toggle buttons reads as a call to action and differs only by fill. Mutually exclusive: status filter, split mode, "Fronted by". Multi-select: participants, Prepaid |
| 11 | **Controls are 44px tall** | The plan's own touch-target floor; shadcn's generated 32px/28px defaults are below it |
| 12 | **Deleting a pre-paid expense hides the split section and splits it equally** | The maths is unchanged and stays correct (Alex −$45 / Sam +$45 for a shared $90 shop). A pre-paid expense is a reimbursement, not a write-off, so consumption still counts |
| 13 | **Sorting is single-column, click to flip, on Date / Name / Amount for expenses** | Tens of rows do not justify a sort chain, and remembering the choice per period adds state for little gain |
| 14 | **Deleting an expense or period is permanent and always confirmed** | Chosen over a soft delete. The dialog names the collateral so a misclick is survivable; no Undo anywhere |
| 15 | **A period is renamed inline from its page header only** | One obvious place to edit it; the home table displays the result but is not itself editable |
| 16 | **The front end was built first against a `localStorage` repository, then swapped to Firestore** | Lets the whole UI, the split engine and every interaction be built and tested before a backend exists. The `Repository` interface makes the swap one file |
| 17 | **One household per installation; the first run is a dialog on `/`, not a route** | The app holds exactly one household, so there is no "start new household" entry point. A missing household document opens the setup modal inline; an existing one goes straight to the period table, with members already persisted |
| 18 | **The Prepaid column names the fronting member, bare** | The money model has exactly one fronting member per expense (`paidBy`), so the column shows just the name ("Alex") rather than a "Yes —" prefix; a since-removed fronting member reads as "Removed member", otherwise `No` (§4) |
| 19 | **Settled period pages restructure; in-progress pages keep tabs** | A settled period is a statement to read and share: settled amounts at the top, the expense table below, no tabs. In-progress periods keep the Expenses/Settlement tabs where the add form and the settle action live |
| 20 | **Share replaces Copy link: `/share/{token}` view-only links, every status** | The page URL only opens the period on the same signed-in browser, so it never was a share. The Share button (page header, next to Reopen/Add expense) creates a bearer-secret token link that opens the household read-only on any device; the old Copy-link button is removed |
| 21 | **Members can be added after setup, from the home page panel** | Setup runs once, so a household that ends up short of members had no in-app recovery. The dialog rejects duplicates per household (§3) and touches no existing expense; the button lives next to the member list, not on period pages |
| 22 | **No exact-cents line under settlement transfers** | The rounded whole-dollar figure is the transfer — the extra "exact $X · rounded up/down" line added noise without changing what anyone pays |
| 23 | **The home page owns members: list, inline rename, add button; header names the household** | The member list belongs next to the household identity, not scattered across period pages — so the Add member button moved from the period header into the home household panel, names edit inline on click, the panel leads with a large household name, and the page header reads "Expense periods for {household}" |
| 24 | **The theme toggle is an icon beside "Create expense period"** | A text "Light/Dark" button under the panel wasted space and attention; a Sun/Moon icon button next to the primary header action is reachable without scrolling and reads without words |
| 25 | **View-only means disabled, not hidden — plus rules that deny regardless** | A share visitor sees the same pages, so every write control renders disabled (greyed out) rather than vanishing: the page still reads as the household. The rules are the real lock — the visitor's uid is not in `memberUids`, so writes are denied even if the UI did not disable them |
| 26 | **Reads are open to any signed-in user; writes are member-only; household listing is denied** | Rules cannot check a bearer token, so link secrecy rests on unguessable ids (token, household, period) exactly like a Drive "anyone with the link" URL. Revoking deletes the token; someone who saved the raw household id keeps read access — accepted for a personal-scale app and stated in §7 |

---

## 12. Implementation phases

The spec is one application, but it was built in two passes and the order matters if reproducing it:

**Phase 1 — client only.** `Repository` backed by `localStorage`, so the entire UI, the split engine,
the settlement maths and every interaction can be built and tested with no backend. `signInAnonymously`
in §7 is *not* wired up in this phase; there is no Firebase dependency yet, and `getHousehold()`
returning `null` is what opens the first-run setup dialog on `/`.

**Phase 2 — Firebase.** Implement `Repository` against the Firestore SDK, add `firestore.rules` and
`firestore.indexes.json`, wire the silent anonymous sign-in, App Check, and App Hosting. Everything
above §7 is already true by the end of Phase 1 and must not be re-litigated in Phase 2.

The rules requirements in §7 and the cascade requirement in §7 are therefore **specifications for
Phase 2**, not behaviours a Phase 1 build needs to reproduce. Note that the Phase 1 repository
enforces the date-range and settled-period rules in application code, because the only backstop in
Phase 1 is the code itself.
