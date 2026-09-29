"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { STORAGE_KEYS } from "@/lib/repository/local";
import { useHousehold } from "@/components/layout/HouseholdProvider";
import { ThemeToggle } from "@/components/layout/ThemeScript";

/**
 * Local-preview helper. Wipes the localStorage repository so the app can be
 * restarted from first run. The Firebase build will replace this with a real
 * "delete household" flow.
 */
export function DevTools() {
  const { setHousehold, members, reloadMembers } = useHousehold();
  const [confirming, setConfirming] = useState(false);

  function reset() {
    for (const key of Object.values(STORAGE_KEYS)) {
      try {
        window.localStorage.removeItem(key);
      } catch {
        // ignore
      }
    }
    setHousehold(null as never);
    void reloadMembers();
    setConfirming(false);
    window.location.href = "/setup";
  }

  return (
    <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
      <p className="font-medium text-foreground">Local preview</p>
      <p>
        Data is stored in this browser only ({members.length} member
        {members.length === 1 ? "" : "s"}). No server yet.
      </p>
      <div className="mt-2 flex items-center gap-2">
        <ThemeToggle />
        {confirming ? (
          <>
            <Button size="sm" variant="destructive" onClick={reset}>
              Yes, erase everything
            </Button>
            <Button size="sm" variant="outline" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setConfirming(true)}>
            Reset data
          </Button>
        )}
      </div>
    </div>
  );
}
