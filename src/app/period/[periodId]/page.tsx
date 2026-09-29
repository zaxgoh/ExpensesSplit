"use client";

import { useParams } from "next/navigation";
import { PeriodView } from "@/components/periods/PeriodView";

export default function PeriodPage() {
  const params = useParams<{ periodId: string }>();
  return <PeriodView periodId={params.periodId} />;
}
