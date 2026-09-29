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
| `NEXT_PUBLIC_FIREBASE_APPHOSTING_BACKEND_ID` | Empty until an App Hosting backend exists. |
| `NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY` | reCAPTCHA Enterprise site key. Empty locally; the emulator accepts App Check tokens without one. |
| `NEXT_PUBLIC_USE_FIREBASE_EMULATORS` | `true` locally, `false` everywhere else. Never `true` in App Hosting. |

Project: **`expensessplit-cb870`**, Firestore region **`asia-southeast1`** (Singapore).

## Run it

The Firestore emulator is mandatory locally: the rules are only testable against it, and it keeps
local data off production. It needs **Java 11+** installed (`java -version`).

```bash
npm install
npm run emulators        # Firestore :8080, Auth :9099, App Check :9199, UI :4000
npm run dev              # http://localhost:3000, against the emulator
```

Open http://localhost:3000. You land on `/setup` to name the household and add at least two
members. After that, `/` is the expense period table.

### Demo data

```bash
npm run seed:emulator -- --household=<uid>
```

Run the app first and read `1stsplit:householdId` out of the browser's localStorage — that is your
anonymous uid, and the rules only let it touch its own household. The seed then fills it with 5
members, 3 periods (two deliberately overlapping) and 30 expenses across all three split modes and
both funding sources. Re-running it replaces the demo periods outright.

Without `--household` it creates a standalone household and prints its id. That one is useful for
poking at in the emulator UI but the app will not be signed in as it, so you cannot open it from
the browser.

## Verify

```bash
npm run typecheck   # tsc --noEmit
npm test            # vitest: split engine, settlement maths, components (jsdom)
npm run test:rules  # vitest + @firebase/rules-unit-testing — NEEDS `npm run emulators` running
npm run build       # production build
```

`npm run test:rules` is deliberately a separate script and not part of `npm test`: it needs a
running emulator, so folding it in would make the unit suite fail on any machine without Java.

## Deploying

```bash
npm run typecheck && npm test && npm run build
npm run deploy:rules   # firebase deploy --only firestore  (rules + indexes)
```

Then App Hosting. It builds from a **connected GitHub repository**, so there is no
`firebase deploy --only apphosting`: a push to the live branch is the deploy, and rollback is
one click in the console. Steps, in order:

1. Grant the Firebase App Hosting GitHub app access to this repository.
2. Create a backend against it (`firebase apphosting:backends:create`), picking the live branch.
3. Put the backend id in `apphosting.yaml` and in `.env.local` — it is referenced by
   `NEXT_PUBLIC_FIREBASE_APPHOSTING_BACKEND_ID`.
4. Register the backend's `*.hosted.app` domain (and any custom domain) in **App Check** →
   allowed domains, *then* enforce App Check on Firestore and Auth. Note that App Hosting serves
   from `hosted.app`, not `web.app`; enforcing before the domain is registered locks the app out of
   its own database.
5. Set a Cloud Billing budget alert and enable the Firestore backup schedule.

`apphosting.staging.yaml` and `apphosting.local.yaml` do not exist yet — the CLI generates the
latter when a backend is created, and the former only matters once there is a staging backend.

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
- The Firestore emulator downloads a JAR and needs **Java 11+** on the machine. That is the only
  local prerequisite beyond Node 20, and it is the reason `npm run test:rules` cannot run here yet.
