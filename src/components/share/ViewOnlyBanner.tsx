"use client";

import { Eye } from "lucide-react";

/** Shown at the top of every view-only share page (§7). */
export function ViewOnlyBanner() {
  return (
    <p className="flex items-center gap-2 rounded-lg border p-3 text-sm text-muted-foreground">
      <Eye className="h-4 w-4 shrink-0" aria-hidden />
      You&apos;re viewing a shared, read-only copy — adding, editing, and deleting are disabled.
    </p>
  );
}
