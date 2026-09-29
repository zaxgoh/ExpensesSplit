"use client";

import dynamic from "next/dynamic";

/**
 * The add/edit expense form is code-split out of the period page.
 *
 * It transitively imports react-day-picker (the calendar) and several Radix
 * primitives (Select, Checkbox, Switch, Popover). The period page only needs it
 * after the user clicks "Add expense", so loading it on demand keeps the calendar
 * out of the route's initial payload and makes the table appear sooner.
 */
export const AddExpenseForm = dynamic(
  () => import("@/components/expenses/AddExpenseForm").then((m) => m.AddExpenseForm),
  {
    ssr: false,
    loading: () => (
      <p className="text-sm text-muted-foreground">Loading form…</p>
    ),
  },
);
