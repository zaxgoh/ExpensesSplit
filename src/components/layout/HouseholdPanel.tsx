"use client";

import { useState } from "react";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useHousehold } from "@/components/layout/HouseholdProvider";
import { MemberList } from "@/components/members/MemberList";
import { AddMemberDialog } from "@/components/members/AddMemberDialog";

/**
 * Household identity panel on the home page: the household name, the member
 * list (names rename inline on click), and the add-member entry point. There
 * is no login and no "start new household" button: the app holds exactly one
 * household per installation (PLAN.md F1), so nothing here can create or
 * switch one. Starting over means clearing site data, which issues a fresh
 * anonymous identity and therefore a fresh, empty household whose setup
 * dialog opens on the next visit.
 */
export function HouseholdPanel() {
  const { household } = useHousehold();
  const [memberDialogOpen, setMemberDialogOpen] = useState(false);

  return (
    <section aria-label="Household" className="grid gap-4 rounded-lg border p-4">
      <h2 className="text-xl font-semibold tracking-tight">
        {household?.name ?? "No household"}
      </h2>

      <MemberList />

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={() => setMemberDialogOpen(true)}>
          <UserPlus className="mr-2 h-4 w-4" aria-hidden />
          Add member
        </Button>
        <span className="text-sm text-muted-foreground">
          Data survives a reload and a browser restart.
        </span>
      </div>

      <AddMemberDialog open={memberDialogOpen} onOpenChange={setMemberDialogOpen} />
    </section>
  );
}
