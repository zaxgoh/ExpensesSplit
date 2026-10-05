"use client";

import { useHousehold } from "@/components/layout/HouseholdProvider";
import { ThemeToggle } from "@/components/layout/ThemeScript";

/**
 * Household identity panel. There is no login and no "start new
 * household" button: the app holds exactly one household per
 * installation (PLAN.md F1), so nothing here can create or switch
 * one. Starting over means clearing site data, which issues a fresh
 * anonymous identity and therefore a fresh, empty household whose
 * setup dialog opens on the next visit.
 */
export function HouseholdPanel() {
  const { household, members } = useHousehold();

  return (
    <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
      <p className="font-medium text-foreground">{household?.name ?? "No household"}</p>
      <p>
        {members.length} member{members.length === 1 ? "" : "s"} in this household.
        Data survives a reload and a browser restart.
      </p>
      <div className="mt-2 flex items-center gap-2">
        <ThemeToggle />
      </div>
    </div>
  );
}
