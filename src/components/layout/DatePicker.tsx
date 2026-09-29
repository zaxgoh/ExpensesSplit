"use client";

import { useState } from "react";
import { format, parseISO } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { ISODate } from "@/types";

/** Year dropdown range, so a distant year is one click away rather than 40. */
const YEAR_FLOOR = 2020;
const YEAR_CEIL = 2030;

/**
 * Dropdown date picker: a button opening a shadcn Calendar with month and year
 * selects in the caption, so no one has to click the arrows repeatedly.
 */
export function DatePicker({
  value,
  onChange,
  min,
  max,
  id,
  placeholder = "Select date",
  disabled,
}: {
  value: ISODate | "";
  onChange: (value: ISODate) => void;
  min?: ISODate;
  max?: ISODate;
  id?: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);

  const selected = value ? parseISO(value) : undefined;
  // Navigation is clamped to the caller's range when it supplies one, so the
  // expense form cannot wander outside its period.
  const startMonth = min ? parseISO(min) : new Date(YEAR_FLOOR, 0, 1);
  const endMonth = max ? parseISO(max) : new Date(YEAR_CEIL, 11, 31);

  // Guarantee a sane span even if a caller passes a reversed range.
  const [from, to] =
    startMonth <= endMonth ? [startMonth, endMonth] : [endMonth, startMonth];

  // Open on the selected month, else today, clamped into the allowed range.
  // Without the clamp an empty picker would open on the range's first month
  // (e.g. January 2020) instead of the current one.
  const today = new Date();
  const preferred = selected ?? today;
  const defaultMonth =
    preferred < from ? from : preferred > to ? to : preferred;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          className="w-full justify-start font-normal"
        >
          <CalendarIcon className="mr-2 h-4 w-4 opacity-70" aria-hidden />
          <span className={value ? "" : "text-muted-foreground"}>
            {value ? format(selected as Date, "MMM d, yyyy") : placeholder}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={defaultMonth}
          // Month and year are separate dropdown lists, not arrow-only navigation.
          captionLayout="dropdown"
          startMonth={from}
          endMonth={to}
          // startMonth/endMonth only clamp navigation; they do NOT stop a day
          // outside the range being selected. Without this matcher the expense
          // form would happily accept a date the period does not cover.
          disabled={(date: Date) => date < from || date > to}
          autoFocus
          onSelect={(date) => {
            if (!date) return;
            onChange(format(date, "yyyy-MM-dd"));
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}


