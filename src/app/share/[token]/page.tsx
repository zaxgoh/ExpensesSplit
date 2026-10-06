"use client";

import { useParams } from "next/navigation";
import { HouseholdPanel } from "@/components/layout/HouseholdPanel";
import { PeriodTable } from "@/components/periods/PeriodTable";
import { SharedShell } from "@/components/share/SharedShell";

/**
 * The shared home page (§7): the period table plus the household panel, both
 * read-only. Period links stay inside the shared view via the shell's
 * `basePath`, so a visitor can navigate to every period but never anywhere
 * that writes.
 */
export default function SharedHomePage() {
  const params = useParams<{ token: string }>();
  return (
    <SharedShell token={params.token}>
      <PeriodTable />
      <HouseholdPanel />
    </SharedShell>
  );
}
