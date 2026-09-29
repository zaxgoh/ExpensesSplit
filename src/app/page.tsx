"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { PeriodTable } from "@/components/periods/PeriodTable";
import { useHousehold } from "@/components/layout/HouseholdProvider";
import { HouseholdPanel } from "@/components/layout/HouseholdPanel";

export default function Home() {
  const { household, ready } = useHousehold();
  const router = useRouter();

  useEffect(() => {
    if (ready && !household) router.replace("/setup");
  }, [ready, household, router]);

  if (!ready) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!household) return null;

  return (
    <div className="grid gap-6">
      <PeriodTable />
      <HouseholdPanel />
    </div>
  );
}
