import type { PeriodStatus } from "@/lib/split/engine";
import { Badge } from "@/components/ui/badge";

const LABEL: Record<PeriodStatus, string> = {
  in_progress: "In progress",
  settled: "Settled",
};

export function statusLabel(status: PeriodStatus): string {
  return LABEL[status];
}

export function StatusBadge({ status }: { status: PeriodStatus }) {
  return (
    <Badge
      variant="outline"
      className={
        status === "settled"
          ? "border-positive/40 text-positive"
          : "border-accent/40 text-accent"
      }
    >
      {LABEL[status]}
    </Badge>
  );
}
