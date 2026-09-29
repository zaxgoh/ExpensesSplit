"use client";

import { useState } from "react";
import { format, parseISO } from "date-fns";
import { DatePicker } from "@/components/layout/DatePicker";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { periodSchema } from "@/lib/validation/schemas";
import type { ISODate } from "@/types";

/**
 * F3: create an expense period. Overlap with an existing period is ALLOWED, so
 * the only date validation is endDate >= startDate.
 */
export function CreatePeriodDialog({
  open,
  onOpenChange,
  onCreate,
  existingNames,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (input: { name: string; startDate: ISODate; endDate: ISODate }) => Promise<void>;
  existingNames: string[];
}) {
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState<ISODate | "">("");
  const [endDate, setEndDate] = useState<ISODate | "">("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function reset() {
    setName("");
    setStartDate("");
    setEndDate("");
    setError(null);
    setSaving(false);
  }

  async function submit() {
    const parsed = periodSchema.safeParse({ name, startDate, endDate });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the details.");
      return;
    }
    const duplicate = existingNames.some(
      (existing) => existing.toLowerCase() === parsed.data.name.toLowerCase(),
    );
    if (duplicate) {
      setError("A period with that name already exists.");
      return;
    }

    setSaving(true);
    try {
      await onCreate(parsed.data);
      onOpenChange(false);
      reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the period.");
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create expense period</DialogTitle>
          <DialogDescription>
            Name the period and choose the dates it covers. Periods may overlap.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5">
          <div className="grid gap-2.5">
            <Label htmlFor="period-name">Name</Label>
            <Input
              id="period-name"
              value={name}
              maxLength={60}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. September 2026"
            />
          </div>

          <div className="grid gap-2.5">
            <Label htmlFor="period-start">Start date</Label>
            <DatePicker id="period-start" value={startDate} onChange={setStartDate} />
          </div>

          <div className="grid gap-2.5">
            <Label htmlFor="period-end">End date</Label>
            <DatePicker
              id="period-end"
              value={endDate}
              onChange={setEndDate}
              min={startDate || undefined}
            />
          </div>

          {error ? (
            <p role="alert" className="text-sm text-negative">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Creating…" : "OK"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export { format as formatDate, parseISO };
