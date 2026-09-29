"use client";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ExpensePeriod, StatusFilter as StatusFilterValue } from "@/types";

const OPTIONS: { value: StatusFilterValue; label: string }[] = [
  { value: "all", label: "All periods" },
  { value: "in_progress", label: "In progress" },
  { value: "settled", label: "Settled" },
];

/** F2/4b: filter above the period table. Defaults to All. */
export function StatusFilter({
  value,
  onChange,
  periods,
}: {
  value: StatusFilterValue;
  onChange: (value: StatusFilterValue) => void;
  periods: ExpensePeriod[];
}) {
  function countFor(option: StatusFilterValue): number {
    if (option === "all") return periods.length;
    return periods.filter((period) => period.status === option).length;
  }

  return (
    <div className="flex items-center gap-3">
      <Button
        asChild
        variant="outline"
        size="sm"
        className="pointer-events-none -mr-2 hidden sm:inline-flex"
      >
        <span>Filter</span>
      </Button>
      <Select
        value={value}
        onValueChange={(next) => onChange(next as StatusFilterValue)}
      >
        <SelectTrigger
          aria-label="Filter expense periods by status"
          className="w-full sm:w-56"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label} ({countFor(option.value)})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
