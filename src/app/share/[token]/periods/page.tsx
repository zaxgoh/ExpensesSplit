"use client";

import { useParams } from "next/navigation";
import { HouseholdPanel } from "@/components/layout/HouseholdPanel";
import { PeriodTable } from "@/components/periods/PeriodTable";
import { SharedShell } from "@/components/share/SharedShell";

/**
 * The shared period list (§7): every period, read-only, for a visitor who
 * arrived on a linked period and wants to browse the rest.
 */
export default function SharedPeriodsPage() {
  const params = useParams<{ token: string }>();
  return (
    <SharedShell token={params.token}>
      <PeriodTable />
      <HouseholdPanel />
    </SharedShell>
  );
}
