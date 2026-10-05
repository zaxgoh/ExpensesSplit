"use client";

import { HouseholdPanel } from "@/components/layout/HouseholdPanel";
import { useHousehold } from "@/components/layout/HouseholdProvider";
import { HouseholdSetupDialog } from "@/components/members/HouseholdSetupDialog";
import { PeriodTable } from "@/components/periods/PeriodTable";

export default function Home() {
  const { household, ready } = useHousehold();

  if (!ready) return <p className="text-sm text-muted-foreground">Loading…</p>;

  // F1: first run. The household document is missing, so the setup dialog
  // is the whole screen — there is no setup route and no "start new
  // household" button. It cannot be dismissed: creating the household is
  // the only way forward, and it never appears again once the document
  // exists. On the next visit the period table below renders directly,
  // with the members created here already available to assign to expenses.
  if (!household) {
    return <HouseholdSetupDialog open onOpenChange={() => {}} />;
  }

  return (
    <div className="grid gap-6">
      <PeriodTable />
      <HouseholdPanel />
    </div>
  );
}
