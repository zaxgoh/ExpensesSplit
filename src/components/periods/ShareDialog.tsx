"use client";

import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { Check, Copy, Link2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useHousehold } from "@/components/layout/HouseholdProvider";
import { buildShareUrl } from "@/lib/share/links";
import type { ShareLink } from "@/types";

/**
 * View-only share links (§7). Creates bearer-secret links of the form
 * `/share/{token}`: anyone holding one can open the household and navigate
 * every period, but every write control renders disabled and the rules deny
 * the writes regardless. Links never expire; deleting one revokes it.
 */
export function ShareDialog({
  open,
  onOpenChange,
  periodId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The period the link is created from — the visitor lands directly on it. */
  periodId: string;
}) {
  const { repository } = useHousehold();
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLinks(await repository.listShareLinks());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load share links.");
    }
  }, [repository]);

  useEffect(() => {
    if (open) {
      setError(null);
      setCopiedToken(null);
      void refresh();
    }
  }, [open, refresh]);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const link = await repository.createShareLink(periodId);
      // Copy first: the link exists even if the list refresh below fails,
      // and the URL must reach the clipboard regardless.
      await copy(link.token);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the link.");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(token: string) {
    setBusy(true);
    setError(null);
    try {
      await repository.deleteShareLink(token);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not revoke the link.");
    } finally {
      setBusy(false);
    }
  }

  async function copy(token: string) {
    try {
      await navigator.clipboard.writeText(buildShareUrl(window.location.origin, token));
      setCopiedToken(token);
      setTimeout(() => setCopiedToken((current) => (current === token ? null : current)), 2000);
    } catch {
      setCopiedToken(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share view-only link</DialogTitle>
          <DialogDescription>
            Anyone with the link lands directly on this period and can browse the
            whole household from there, on any device. They cannot add, edit, or
            delete anything. Links never expire — revoke one to cut off access.
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <p role="alert" className="text-sm text-negative">
            {error}
          </p>
        ) : null}

        {links.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No share links yet. Create one to send to the household.
          </p>
        ) : (
          <ul className="grid gap-2">
            {links.map((link) => (
              <li
                key={link.token}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
              >
                <span className="text-sm">
                  <span className="font-medium">View-only link</span>
                  <br />
                  <span className="text-muted-foreground">
                    Created {format(link.createdAt, "MMM d, yyyy")}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void copy(link.token)}
                    aria-label={`Copy share link created ${format(link.createdAt, "MMM d, yyyy")}`}
                  >
                    {copiedToken === link.token ? (
                      <Check className="mr-2 h-4 w-4" aria-hidden />
                    ) : (
                      <Copy className="mr-2 h-4 w-4" aria-hidden />
                    )}
                    {copiedToken === link.token ? "Copied" : "Copy"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void revoke(link.token)}
                    disabled={busy}
                    className="text-muted-foreground hover:text-negative"
                  >
                    <Trash2 className="mr-2 h-4 w-4" aria-hidden />
                    Revoke
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className="flex justify-end">
          <Button onClick={() => void create()} disabled={busy}>
            <Link2 className="mr-2 h-4 w-4" aria-hidden />
            {busy ? "Working…" : links.length === 0 ? "Create link" : "Create new link"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
