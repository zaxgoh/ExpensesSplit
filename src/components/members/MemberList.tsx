"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { useHousehold } from "@/components/layout/HouseholdProvider";
import { memberNameSchema } from "@/lib/validation/schemas";
import type { Member } from "@/types";

/**
 * The household's members, shown under the panel's household name. Clicking
 * a name turns it into a textbox: Enter or blur saves, Escape cancels. Names
 * stay unique case-insensitively per household (§3), so a rename that
 * collides is rejected inline.
 */
export function MemberList() {
  const { members } = useHousehold();

  if (members.length === 0) {
    return (
      <p className="text-base text-muted-foreground">
        No members yet — add the first below.
      </p>
    );
  }

  return (
    <ul className="grid gap-2">
      {members.map((member) => (
        <li key={member.id}>
          <MemberRow member={member} siblings={members} />
        </li>
      ))}
    </ul>
  );
}

function MemberRow({ member, siblings }: { member: Member; siblings: Member[] }) {
  const { repository, reloadMembers } = useHousehold();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(member.name);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function startEdit() {
    setDraft(member.name);
    setError(null);
    setEditing(true);
  }

  function cancel() {
    setEditing(false);
    setError(null);
  }

  async function save() {
    const parsed = memberNameSchema.safeParse(draft);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Enter a name.");
      return;
    }
    if (
      siblings.some(
        (m) => m.id !== member.id && m.name.toLowerCase() === parsed.data.toLowerCase(),
      )
    ) {
      setError("Another member already has that name.");
      return;
    }
    if (parsed.data === member.name) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await repository.updateMember(member.id, { name: parsed.data });
      await reloadMembers();
      setEditing(false);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not rename the member.");
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={startEdit}
        aria-label={`Rename ${member.name}`}
        title="Click to rename"
        className="flex min-h-11 w-full items-center gap-2.5 rounded-lg border px-3 text-left text-base hover:bg-secondary/40"
      >
        <span aria-hidden="true" className="text-xl">
          {member.avatar}
        </span>
        <span className="font-medium">{member.name}</span>
      </button>
    );
  }

  return (
    <div className="grid gap-1.5 rounded-lg border p-2.5">
      <div className="flex items-center gap-2.5">
        <span aria-hidden="true" className="text-xl">
          {member.avatar}
        </span>
        <Input
          autoFocus
          value={draft}
          maxLength={40}
          disabled={saving}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => void save()}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void save();
            } else if (event.key === "Escape") {
              cancel();
            }
          }}
          aria-label={`New name for ${member.name}`}
        />
      </div>
      {error ? (
        <p role="alert" className="text-sm text-negative">
          {error}
        </p>
      ) : null}
    </div>
  );
}
