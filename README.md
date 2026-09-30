# 1ST split

Next.js App Router + Cloud Firestore. **No login**: each browser signs in anonymously, and the
resulting uid is the household, so every read and write is authorised by Firestore rules on
`households/{uid}.memberUids`. Data survives a reload, a browser restart and a different device.

The whole app reads and writes through one seam — `src/lib/repository/types.ts` — so the storage
backend is a single-file decision. The Firestore implementation is what runs; the `localStorage`
one is kept because the component tests inject it.

## Firebase configuration

`.env.local` is gitignored; `.env.local.example` is the committed template. Copy it and fill in
from the Firebase console (Project settings → General → Your apps → SDK setup and configuration):

```bash
cp .env.local.example .env.local
```

| Variable | Notes |
|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` … `NEXT_PUBLIC_FIREBASE_APP_ID` | The web app config. The API key is **not** a secret — it ships in the client bundle by design. |

Project: **`expensessplit-cb870`**, Firestore region **`asia-southeast1`** (Singapore).

**There is no emulator.** Local development talks to the real project, so `.env.local` and
`apphosting.yaml` hold identical values and there is no mode flag to flip. Local writes are real
writes: the data is scoped to your own anonymous household by `firestore.rules`, but it is not
disposable, and you are billed for it.

## Run it

```bash
npm install
npm run dev              # http://localhost:3000, against the real project
```

Open http://localhost:3000. You land on `/setup` to name the household and add at least two
members. After that, `/` is the expense period table.

## Verify

```bash
npm run typecheck   # tsc --noEmit
npm test            # vitest: split engine, settlement maths, components (jsdom)
npm run build       # production build
```

## Deploying

```bash
npm run typecheck && npm test && npm run build
npm run deploy:rules   # firebase deploy --only firestore  (rules + indexes)
```

Then App Hosting. Because the backend is connected to a **GitHub repository**, a push to the live
branch is the deploy, and rollback is one click in the console. There *is* also a CLI source-deploy
path (`firebase deploy --only apphosting:<backendId>`), but it needs an `apphosting` block in
`firebase.json` that `firebase init apphosting` writes; configuring from the console skips that, so
the GitHub path is the one in use here.

Steps, in order:

1. Grant the Firebase App Hosting GitHub app access to this repository.
2. Create a backend against it (`firebase apphosting:backends:create`), picking the live branch.
   **Pass `--primary-region asia-southeast1`** to match the Firestore location — the default
   `us-central1` puts every read and write across the Pacific.
3. **Enable Anonymous sign-in** in the console (Authentication → Sign-in method). `ensureSignedIn`
   throws without it and the deployed app cannot create a household. There is no code change and no
   env var for this — it is a console setting.
4. Push to the live branch, then `npm run deploy:rules` so production Firestore is running the
   rules in this repo.
5. Set a Cloud Billing budget alert and enable the Firestore backup schedule.

Nothing in `apphosting.yaml` needs filling in — the backend id is not an env var the app reads, and
App Check is not in use. See the note below on what that means for the security model.

### Security without App Check

The app deliberately has no login, so it is worth being precise about what does and does not protect
the data.

**Still protected.** `firestore.rules` authorise every read and write on `households/{uid}.memberUids`.
A signed-in anonymous uid can only touch the household that contains it, `memberUids` is immutable
after creation, and members and meta documents are never deletable. One household cannot read or
write another's data, with or without App Check.

**Not protected.** Anonymous sign-in is open, so any script can create a household and write expenses
to it. App Check is what stops that. Without it, the exposure is abuse and runaway spend rather than
a data leak: a bot can inflate your Firestore bill and litter the household list. Anonymous accounts
also accumulate in Authentication, which has its own quota.

Worth setting a billing budget alert (step 5) for that reason. If abuse becomes a problem, adding
App Check later is self-contained: it is one env var with `BUILD` availability, a few lines in
`src/lib/firebase/client.ts`, and a one-time call before the first Firestore read.

`apphosting.staging.yaml` and `apphosting.local.yaml` do not exist yet — the CLI generates the
latter when a backend is created, and the former only matters once there is a staging backend.
`apphosting.local.yaml` is gitignored, since it may hold plaintext secrets.

### `apphosting.yaml` gotcha

`availability` must be a **block** sequence:

```yaml
    availability:
      - BUILD
      - RUNTIME
```

The flow form `availability: [BUILD, RUNTIME]` is perfectly valid YAML and parses fine locally —
`firebase-tools` reads it without complaint — but App Hosting's config validator rejects the file
with *"is not formatted properly"*. The error surfaces only at deploy time, and only says the file is
malformed without naming the offending key, so it is worth knowing in advance.

## Data model

```text
households/{uid}                                      name, memberUids[], memberIds[], settings
households/{uid}/members/{memberId}                   name, avatar, colorHex, archived
households/{uid}/periods/{periodId}                   dates, status, totalAmountMinor, expenseCount
households/{uid}/periods/{periodId}/expenses/{id}    full expense, sharesMinor materialised
households/{uid}/meta/categories                      the nine default categories
```

Three things worth knowing before reading the code:

- **`memberUids` is the access control list** and is immutable after creation. `memberIds` is a
  separate, append-only list of member document ids that exists purely so the rules can answer
  "is this participant a real member?" — the rules language has no loop, so it cannot check a list
  of documents one at a time. Archived members stay in `memberIds` so historical expenses remain
  referentially valid.
- **`sharesMinor` is materialised onto each expense** at write time, so balances never need
  recomputing and a later change to the split algorithm cannot rewrite history.
- **`totalAmountMinor` / `expenseCount` are denormalised onto the period** and recomputed from the
  expenses inside the same `writeBatch` as the write that changed them. Firestore rules *cannot*
  enforce this — a rule cannot see the other writes in a batch — so it is the repository's
  responsibility, and the reason `firestore.rules` says so in a comment rather than pretending.

Deleting a period cascades client-side: every expense in batches of ≤400, then the period document
**last**, so an interrupted delete leaves a visible period rather than a hidden one full of
unreachable data. Firestore does not cascade, and rules cannot delete children on a parent's
behalf.

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
- Firestore `createdAt`/`updatedAt` are `Timestamp`s written with `serverTimestamp()` (the rules
  require `createdAt == request.time`), mapped to `number` milliseconds at the repository boundary
  so the domain types and every component stay unchanged.
- The component suite drives real Radix primitives through `userEvent`, which is slow in jsdom, so
  `testTimeout` is raised to 30s. `act(...)` warnings from Radix `Select` are expected noise.
- `npm run lint` does not work: `next lint` is deprecated in Next 15.5 and prompts for a config on
  a repo that has no ESLint config file. Use `npx tsc --noEmit` plus the tests until it is migrated
  to the ESLint CLI.
- `npm audit` reports vulnerabilities in the shadcn/Radix dependency tree. Worth resolving before
  any deploy.
- **`firestore.rules` has no automated test coverage.** `@firebase/rules-unit-testing` only works
  against the Firestore emulator, and there is no emulator here, so `tests/firestore.rules.test.ts`
  was removed rather than kept half-working. The rules are the only thing stopping one household
  from reading another's data, and nothing checks them now: a future edit that opens a hole will
  ship silently. Reinstating the suite is straightforward — add `@firebase/rules-unit-testing` and
  a `firestore` block to `firebase.json`, restore the test file, and run it in GitHub Actions so
  contributors still need no Java installed.
- Local development writes to the real project. There is no disposable environment, so `npm run
  dev` creates real households, real anonymous accounts in Authentication, and real Firestore
  reads/writes that count toward billing.
