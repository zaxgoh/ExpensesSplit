# 1ST split — local preview

Front end only. **No backend yet.** Data lives in this browser's `localStorage`, behind the
repository interface in `src/lib/repository/` so a Firestore implementation can drop in later.

## Run it

```bash
npm install
npm run dev
```

Then open http://localhost:3000. You will land on `/setup` to name the household and add at least
two members. After that, `/` is the expense period table.

## Verify

```bash
npm run typecheck   # tsc --noEmit
npm test            # vitest: 52 tests
npm run build       # production build
```

## What works

- **Periods**: table with Name / Start date / End date / Total expense amount / Status, default-sorted
  by start date ascending with a sort toggle, All / In progress / Settled filter, empty state, a
  create dialog, per-row delete, and inline rename from the period page header. Overlapping periods are
  allowed; only `endDate >= startDate` and duplicate names are rejected.
- **Expenses**: per-period table with Date / Name / Description / Prepaid / Mode of split / Amount.
  Date, Name and Amount are sortable ascending and descending. Rows are editable and deletable.
  The add form covers date, name, description, amount, a `Prepaid by a member` checkbox with a
  "Fronted by" dropdown, and the split mode — exactly Equal (default), Exact and Percentage — chosen
  from a dropdown, with a checkbox per member. Marking an expense pre-paid hides the whole split
  section and splits it equally across all members.
- **Date pickers**: shadcn Calendar with separate month and year dropdowns (2020–2030), out-of-range
  days disabled, opening on the current month.
- **Settlement**: per-member transfers against the household account. Amounts owed round **up** to a
  whole dollar, reimbursements round **down**. Settle and Reopen are user actions; a settled period is
  read-only.
- Dark/light theme toggle, and a "Reset data" panel to start over.

## Not built yet

Firebase, Firestore, `firestore.rules`, `apphosting.yaml`, the emulator suite, category management, and
the multi-device join link.

## Notes

- **Do not run `npx shadcn@latest add ...` without re-checking `src/components/ui/`.** It overwrites
  existing components from the upstream registry, which silently reverted the 44px control sizing
  required by PLAN.md section 6. `src/components/ui/ui-guards.test.ts` fails if this happens again.
- `src/lib/split/engine.ts` and `src/lib/split/account.ts` are pure and independently tested. They are
  the part worth reviewing first.
- Money is integer cents throughout. `floorWholeDollars` floors the *magnitude* and reapplies the
  sign, because `Math.floor(-40.6)` is `-41`, which would make the account reimburse more than it owes.
- The funding invariant `sum(toAccountExact) == totalSpend - totalPrePaid` is asserted at runtime in
  development. The rounded figures deliberately do **not** sum back to the same total; that is the
  specified behaviour, not a bug.
- The component suite drives real Radix primitives through `userEvent`, which is slow in jsdom, so
  `testTimeout` is raised to 30s. `act(...)` warnings from Radix `Select` are expected noise.
- `npm audit` reports 5 vulnerabilities from the shadcn/Radix dependency tree. Nothing is wired to a
  network yet, so there is no exposure, but it is worth resolving before any deploy.
