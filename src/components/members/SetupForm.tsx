"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useHousehold } from "@/components/layout/HouseholdProvider";
import { householdNameSchema, memberNameSchema } from "@/lib/validation/schemas";
import { AVATARS } from "@/lib/repository/local";

/** F1: first run. No currency is asked for; the app always uses "$". */
export function SetupForm() {
  const { repository, setHousehold, reloadMembers } = useHousehold();
  const router = useRouter();

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
      for (const name of members) {
        await repository.createMember(name, AVATARS[0]);
      }
      await reloadMembers();
      setHousehold(created);
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not finish setup.");
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-8 pb-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Set up your household</h1>
        <p className="text-sm text-muted-foreground">
          No account needed. Everything is stored on this device.
        </p>
      </div>

      <div className="grid max-w-md gap-2.5">
        <Label htmlFor="household-name">Household name</Label>
        <Input
          id="household-name"
          value={householdName}
          maxLength={60}
          onChange={(event) => setHouseholdName(event.target.value)}
          placeholder="e.g. 12 Maple Street"
        />
      </div>

      <div className="grid max-w-md gap-4">
        <Label htmlFor="member-name">Members</Label>
        <div className="flex gap-3">
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
            {members.map((name) => (
              <li
                key={name}
                className="flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-base"
              >
                {name}
                <button
                  type="button"
                  aria-label={`Remove ${name}`}
                  onClick={() => setMembers((current) => current.filter((m) => m !== name))}
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

      <div>
        <Button onClick={submit} disabled={saving}>
          {saving ? "Setting up…" : "Continue"}
        </Button>
      </div>
    </div>
  );
}

