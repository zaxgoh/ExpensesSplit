"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { HouseholdProvider } from "@/components/layout/HouseholdProvider";
import { ViewOnlyBanner } from "@/components/share/ViewOnlyBanner";
import {
  createFirestoreRepository,
  firestoreRepository,
} from "@/lib/repository/firestore";
import type { ShareLink } from "@/types";

/**
 * Resolves `/share/{token}` to its household and renders the children inside
 * a read-only provider scoped to that household (§7). The visitor signs in
 * anonymously like anyone else, but their uid is not in `memberUids`, so the
 * rules let them read and deny every write — the disabled buttons are the
 * visible half of that guarantee.
 */
export function SharedShell({
  token,
  children,
}: {
  token: string;
  children: React.ReactNode;
}) {
  const [link, setLink] = useState<ShareLink | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    firestoreRepository
      .resolveShareLink(token)
      .then((resolved) => {
        if (active) setLink(resolved);
      })
      .catch((err) => {
        if (active) {
          setError(err instanceof Error ? err.message : "Could not open the share link.");
        }
      });
    return () => {
      active = false;
    };
  }, [token]);

  const repository = useMemo(
    () =>
      link ? createFirestoreRepository({ householdId: link.householdId }) : firestoreRepository,
    [link],
  );

  if (error) {
    return (
      <div className="grid gap-3">
        <p role="alert">{error}</p>
        <Link href="/" className="text-accent hover:underline">
          Back to expense periods
        </Link>
      </div>
    );
  }

  if (link === undefined) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  if (link === null) {
    return (
      <div className="grid gap-3">
        <p>
          This share link is invalid or has been revoked. Ask the household owner
          for a new one.
        </p>
        <Link href="/" className="text-accent hover:underline">
          Back to expense periods
        </Link>
      </div>
    );
  }

  return (
    <HouseholdProvider repository={repository} readOnly basePath={`/share/${token}`}>
      <div className="grid gap-6">
        <ViewOnlyBanner />
        {children}
      </div>
    </HouseholdProvider>
  );
}
