"use client";

import dynamic from "next/dynamic";

/**
 * The create-period dialog is code-split out of the home page for the same reason
 * as the expense form: it pulls in the calendar and Dialog/Input primitives, and
 * the period table does not need them until the user asks.
 */
export const CreatePeriodDialog = dynamic(
  () => import("@/components/periods/CreatePeriodDialog").then((m) => m.CreatePeriodDialog),
  {
    loading: () => null,
  },
);
