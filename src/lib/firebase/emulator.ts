/**
 * Emulator wiring, kept in its own module so the production bundle tree-shakes
 * it. `useEmulators` is a build-time constant — App Hosting inlines
 * `NEXT_PUBLIC_USE_FIREBASE_EMULATORS` as the literal "false", which folds
 * every branch below away and drops these calls from the client build.
 *
 * Only ever connect from a Node/browser runtime. Connecting during
 * `next build` would hang the build on a connection to localhost.
 */

import { connectAuthEmulator, type Auth } from "firebase/auth";
import { connectFirestoreEmulator, type Firestore } from "firebase/firestore";

export const EMULATOR_HOST = "127.0.0.1";
export const EMULATOR_PORTS = { auth: 9099, firestore: 8080 };

export function connectEmulators(db: Firestore, auth: Auth): void {
  if (typeof window === "undefined") return;
  connectFirestoreEmulator(db, EMULATOR_HOST, EMULATOR_PORTS.firestore);
  connectAuthEmulator(auth, `http://${EMULATOR_HOST}:${EMULATOR_PORTS.auth}`, {
    disableWarnings: true,
  });
}
