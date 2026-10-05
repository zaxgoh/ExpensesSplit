/**
 * The one place the Firebase SDKs are initialised.
 *
 * Everything is client-only: the household id is an anonymous uid that lives in
 * browser storage, so there is nothing meaningful to do at request time. The
 * module still guards on `typeof window` because Next.js evaluates imported
 * modules during the production build.
 *
 * There is no emulator wiring. Local development and App Hosting both talk to
 * the real project, so `NEXT_PUBLIC_FIREBASE_*` is the only configuration and
 * there is no mode to flip. See README, 'Firebase configuration'.
 */

import { initializeApp, type FirebaseApp, type FirebaseOptions } from "firebase/app";
import { getAuth, signInAnonymously, type Auth } from "firebase/auth";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from "firebase/firestore";

/** The API key is not a secret — it ships in the client bundle by design. */
function readConfig(): FirebaseOptions {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!apiKey || !projectId) {
    throw new Error(
      "Firebase is not configured. Copy .env.local.example to .env.local and fill it in " +
        "(see README, 'Firebase configuration').",
    );
  }
  return {
    apiKey,
    projectId,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };
}

let app: FirebaseApp | null = null;

export function getFirebaseApp(): FirebaseApp {
  if (app) return app;
  app = initializeApp(readConfig());
  return app;
}

let firestore: Firestore | null = null;

export function getDb(): Firestore {
  if (firestore) return firestore;
  firestore = initializeFirestore(getFirebaseApp(), {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });
  return firestore;
}

let auth: Auth | null = null;

export function getFirebaseAuth(): Auth {
  if (auth) return auth;
  auth = getAuth(getFirebaseApp());
  return auth;
}

/**
 * §7: sign in anonymously, silently, with no UI and no sign-out button. The
 * returned uid is the household document id.
 */
export async function ensureSignedIn(): Promise<string> {
  const instance = getFirebaseAuth();
  // `authStateReady` resolves the persisted anonymous account without waiting
  // for a round trip, so a returning visitor is not signed in twice.
  await instance.authStateReady();
  if (instance.currentUser) return instance.currentUser.uid;
  const credential = await signInAnonymously(instance);
  return credential.user.uid;
}

// ------------------------------------------------------------- browser state

/**
 * Storage keys from §7. The household id is the anonymous uid, cached so the
 * first paint can open the first-run setup dialog before Auth has resolved.
 *
 * The join secret is deliberately NOT sent to Firestore in v1: there is no
 * share link yet, and writing a bearer secret server-side would put it behind
 * the very rules it is meant to protect.
 */
export const STORAGE = {
  householdId: "1stsplit:householdId",
  joinSecret: "1stsplit:joinSecret",
  theme: "1stsplit:theme",
  lastPeriodId: "1stsplit:lastPeriodId",
  draftExpense: "1stsplit:draftExpense",
} as const;

function readItem(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    // Private mode, or storage disabled. §7: fall back to in-memory behaviour
    // rather than failing — the caller shows the "this session will not be
    // saved" banner.
    return null;
  }
}

function writeItem(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // see readItem
  }
}

export function getStoredHouseholdId(): string | null {
  if (typeof window === "undefined") return null;
  return readItem(STORAGE.householdId);
}

export function setStoredHouseholdId(id: string): void {
  writeItem(STORAGE.householdId, id);
}

export function clearStoredHouseholdId(): void {
  try {
    window.localStorage.removeItem(STORAGE.householdId);
  } catch {
    // see readItem
  }
}

/** 128 bits, base64url — a bearer secret for the future join link. */
export function newJoinSecret(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = "";
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
