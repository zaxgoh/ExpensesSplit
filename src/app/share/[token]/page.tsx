"use client";

import { useParams } from "next/navigation";
import { HouseholdPanel } from "@/components/layout/HouseholdPanel";
import { PeriodTable } from "@/components/periods/PeriodTable";
import { PeriodView } from "@/components/periods/PeriodView";
import { SharedShell } from "@/components/share/SharedShell";

/**
 * The share landing page (§7). A link created from a period carries that
 * period, so the visitor lands directly on it — a settled period shows its
 * transfers at the top with no clicks needed. The back link reaches the
 * shared list, so every other period stays one click away. Links without a
 * period (written before periods were pinned) land on the list instead.
 */
export default function SharedHomePage() {
  const params = useParams<{ token: string }>();
  return (
    <SharedShell token={params.token}>
      {(link) =>
        link.periodId ? (
          <PeriodView periodId={link.periodId} />
        ) : (
          <>
            <PeriodTable />
            <HouseholdPanel />
          </>
        )
      }
    </SharedShell>
  );
}
