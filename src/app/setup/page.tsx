"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { SetupForm } from "@/components/members/SetupForm";
import { useHousehold } from "@/components/layout/HouseholdProvider";

export default function SetupPage() {
  const { household, ready } = useHousehold();
  const router = useRouter();

  useEffect(() => {
    if (ready && household) router.replace("/");
  }, [ready, household, router]);

  if (!ready) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (household) return null;

  return <SetupForm />;
}
