"use client";

import { useEffect, useRef, useState } from "react";
import { Pencil } from "lucide-react";
import { Input } from "@/components/ui/input";
import { nameSchema } from "@/lib/validation/schemas";

/**
 * Click the period name to edit it inline. Saves on Enter or blur, cancels on
 * Escape. Rejects an empty name, a name over 60 characters, or a name already
 * used by another period.
 */
export function InlinePeriodName({
  name,
  existingNames,
  disabled,
  onRename,
}: {
  name: string;
  existingNames: string[];
  disabled: boolean;
  onRename: (next: string) => Promise<void> | void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(name);
  }, [name, editing]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function start() {
    if (disabled) return;
    setDraft(name);
    setError(null);
    setEditing(true);
  }

  async function commit() {
    const parsed = nameSchema.safeParse(draft);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Enter a valid name.");
      return;
    }
    const duplicate = existingNames.some(
      (existing) =>
        existing.toLowerCase() === parsed.data.toLowerCase() &&
        existing.toLowerCase() !== name.toLowerCase(),
    );
    if (duplicate) {
      setError("A period with that name already exists.");
      return;
    }
    if (parsed.data === name) {
      setEditing(false);
      return;
    }
    try {
      await onRename(parsed.data);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not rename.");
    }
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={start}
        disabled={disabled}
        title={disabled ? "Reopen the period to rename it" : "Click to rename"}
        className="group inline-flex items-center gap-2 text-left disabled:cursor-default"
      >
        <span>{name}</span>
        {disabled ? null : (
          <Pencil
            className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
            aria-hidden
          />
        )}
      </button>
    );
  }

  return (
    <span className="grid gap-1.5">
      <span className="flex items-center gap-2">
        <Input
          ref={inputRef}
          value={draft}
          maxLength={60}
          aria-label="Expense period name"
          className="h-11 max-w-sm text-2xl font-semibold tracking-tight"
          onChange={(event) => {
            setDraft(event.target.value);
            setError(null);
          }}
          onBlur={() => void commit()}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void commit();
            }
            if (event.key === "Escape") {
              event.preventDefault();
              setDraft(name);
              setError(null);
              setEditing(false);
            }
          }}
        />
      </span>
      {error ? <span className="text-sm text-negative">{error}</span> : null}
      <span className="text-sm text-muted-foreground">
        Press Enter to save, Escape to cancel.
      </span>
    </span>
  );
}
