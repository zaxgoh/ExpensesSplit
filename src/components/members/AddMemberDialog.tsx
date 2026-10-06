"use client";

import { useState } from "react";
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
import { useHousehold } from "@/components/layout/HouseholdProvider";
import { AVATARS } from "@/lib/members/avatars";
import { memberNameSchema } from "@/lib/validation/schemas";

/**
 * Adds one member to the household after setup. Setup itself only runs while
 * the household document is missing, so without this a household that ends
 * up short of members — or simply gains a housemate — has no in-app recovery.
 * Names stay unique case-insensitively per household (§3), including archived
 * members, and the avatar continues the setup round-robin.
 */
export function AddMemberDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { repository, members, reloadMembers } = useHousehold();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function handleOpenChange(next: boolean) {
    if (next) {
      setName("");
      setError(null);
    }
    onOpenChange(next);
  }

  async function submit() {
    const parsed = memberNameSchema.safeParse(name);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Enter a name.");
      return;
    }
    if (
      members.some((m) => m.name.toLowerCase() === parsed.data.toLowerCase())
    ) {
      setError("That member is already added.");
      return;
    }
    setSaving(true);
    try {
      await repository.createMember(
        parsed.data,
        AVATARS[members.length % AVATARS.length],
      );
      await reloadMembers();
      handleOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add the member.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add a member</DialogTitle>
          <DialogDescription>
            They join every future split. Past expenses are untouched.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2.5">
          <Label htmlFor="add-member-name">Member name</Label>
          <div className="flex items-center gap-3">
            <span className="text-xl" aria-hidden="true">
              {AVATARS[members.length % AVATARS.length]}
            </span>
            <Input
              id="add-member-name"
              value={name}
              maxLength={40}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void submit();
                }
              }}
              placeholder="e.g. Riley"
            />
          </div>
          {error ? (
            <p role="alert" className="text-sm text-negative">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={saving}>
            {saving ? "Adding…" : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
