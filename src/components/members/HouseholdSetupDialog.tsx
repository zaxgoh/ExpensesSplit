"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
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
import { householdNameSchema, memberNameSchema } from "@/lib/validation/schemas";

/**
 * F1: first run. A modal on `/`, not a route — the app holds exactly one
 * household per installation, so there is no setup page and no "start new
 * household" button. The home page renders this only while the household
 * document is missing, and it cannot be dismissed: creating the household
 * is the only way forward. Once the document exists the dialog never
 * appears again, and the members created here persist for assigning to
 * expenses. No currency is asked for; the app always uses "$".
 */
export function HouseholdSetupDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { repository, setHousehold, reloadMembers } = useHousehold();

  const [householdName, setHouseholdName] = useState("");
  const [members, setMembers] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function addMember() {
    const parsed = memberNameSchema.safeParse(draft);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Enter a name.");
      return;
    }
    if (members.some((m) => m.toLowerCase() === parsed.data.toLowerCase())) {
      setError("That member is already added.");
      return;
    }
    setMembers((current) => [...current, parsed.data]);
    setDraft("");
    setError(null);
  }

  async function submit() {
    const parsed = householdNameSchema.safeParse(householdName);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Enter a household name.");
      return;
    }
    if (members.length < 2) {
      setError("Add at least two members.");
      return;
    }
    setSaving(true);
    try {
      const created = await repository.createHousehold(parsed.data);
      for (const [index, name] of members.entries()) {
        // Round-robin avatars, matching the live preview on the chips.
        await repository.createMember(name, AVATARS[index % AVATARS.length]);
      }
      await reloadMembers();
      setHousehold(created);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not finish setup.");
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="max-h-[calc(100%-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] max-sm:inset-x-0 max-sm:bottom-0 max-sm:top-auto max-sm:translate-x-0 max-sm:translate-y-0 max-sm:max-w-full max-sm:rounded-t-none sm:max-w-md"
      >
        <DialogHeader>
          <DialogTitle>Set up your household</DialogTitle>
          <DialogDescription>
            No account needed. This household is identified by an anonymous
            sign-in on this device, so there is nothing to log in to later.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 overflow-y-auto pr-1">
          <div className="grid gap-2.5">
            <Label htmlFor="household-name">Household name</Label>
            <Input
              id="household-name"
              value={householdName}
              maxLength={60}
              onChange={(event) => setHouseholdName(event.target.value)}
              placeholder="e.g. 12 Maple Street"
            />
          </div>

          <div className="grid gap-4">
            <Label htmlFor="member-name">Members</Label>
            <div className="flex items-center gap-3">
              {/* Live preview of the avatar the next member will get. */}
              <span className="text-xl" aria-hidden="true">
                {AVATARS[members.length % AVATARS.length]}
              </span>
              <Input
                id="member-name"
                value={draft}
                maxLength={40}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addMember();
                  }
                }}
                placeholder="Add a member and press Enter"
              />
              <Button type="button" variant="outline" onClick={addMember}>
                <Plus className="mr-2 h-4 w-4" />
                Add
              </Button>
            </div>

            {members.length > 0 ? (
              <ul className="flex flex-wrap gap-2.5">
                {members.map((name, index) => (
                  <li
                    key={name}
                    className="flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-base"
                  >
                    <span aria-hidden="true">{AVATARS[index % AVATARS.length]}</span>
                    {name}
                    <button
                      type="button"
                      aria-label={`Remove ${name}`}
                      onClick={() =>
                        setMembers((current) => current.filter((m) => m !== name))
                      }
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <p className="text-xs text-muted-foreground">Add at least two members.</p>
          </div>

          {error ? (
            <p role="alert" className="text-sm text-negative">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Setting up…" : "Continue"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
