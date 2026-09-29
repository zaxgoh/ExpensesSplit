"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useHousehold } from "@/components/layout/HouseholdProvider";
import { ThemeToggle } from "@/components/layout/ThemeScript";
import { clearStoredHouseholdId, getFirebaseAuth } from "@/lib/firebase/client";

/**
 * Household identity controls. There is no login, so the household *is* the
 * anonymous account: "start over" signs that account out and drops the cached
 * household id, and the next visit signs in as a new uid and lands on `/setup`.
 *
 * This is one-way for the old household — it stays in Firestore. Deleting a
 * household and all of its data is not wired up in v1; the Firebase console can
 * do it, and §7 accepts that console access exposes every household.
 */
export function HouseholdPanel() {
  const { household, members } = useHousehold();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function startOver() {
    setBusy(true);
    try {
      await getFirebaseAuth().signOut();
    } catch {
      // Nothing to sign out of; dropping the cached id is enough.
    }
    clearStoredHouseholdId();
    window.location.href = "/setup";
  }

  return (
    <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
      <p className="font-medium text-foreground">{household?.name ?? "No household"}</p>
      <p>
        {members.length} member{members.length === 1 ? "" : "s"} in this browser's household. Data
        is stored in Cloud Firestore and survives a reload or a different device, once the join
        link ships.
      </p>
      <div className="mt-2 flex items-center gap-2">
        <ThemeToggle />
        {confirming ? (
          <>
            <Button size="sm" variant="destructive" disabled={busy} onClick={() => void startOver()}>
              Yes, start a new household
            </Button>
            <Button size="sm" variant="outline" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setConfirming(true)}>
            Start a new household
          </Button>
        )}
      </div>
    </div>
  );
}
