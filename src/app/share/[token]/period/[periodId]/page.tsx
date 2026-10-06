"use client";

import { useParams } from "next/navigation";
import { PeriodView } from "@/components/periods/PeriodView";
import { SharedShell } from "@/components/share/SharedShell";

/**
 * One shared period (§7): the same period page, read-only. The back link
 * returns to the shared home page, not the owner's.
 */
export default function SharedPeriodPage() {
  const params = useParams<{ token: string; periodId: string }>();
  return (
    <SharedShell token={params.token}>
      <PeriodView periodId={params.periodId} />
    </SharedShell>
  );
}
