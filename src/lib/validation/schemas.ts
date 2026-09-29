import { z } from "zod";

/** One schema per write path. Mirrored by the Firestore rules once the backend exists. */

const nameSchema = z.string().trim().min(1, "Name is required.").max(60, "Max 60 characters.");

export { nameSchema };

export const memberNameSchema = z
  .string()
  .trim()
  .min(1, "Name is required.")
  .max(40, "Max 40 characters.");

export const householdNameSchema = z
  .string()
  .trim()
  .min(1, "Household name is required.")
  .max(60, "Max 60 characters.");

export const isodateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use the date picker.");

export const periodSchema = z
  .object({
    name: nameSchema,
    startDate: isodateSchema,
    endDate: isodateSchema,
  })
  .refine((value) => value.endDate >= value.startDate, {
    message: "End date must be on or after the start date.",
    path: ["endDate"],
  });

export type PeriodInput = z.infer<typeof periodSchema>;

/** Unbalanced-split guard shared by the expense form. */
export function assertBalanced(
  mode: string,
  participants: string[],
  entries: { valueMinor: number | null; percentBps: number | null }[],
  amountMinor: number,
): string | null {
  if (participants.length === 0) return "Select at least one member.";
  if (mode === "equal") return null;
  if (mode === "exact") {
    const sum = entries.reduce((acc, e) => acc + (e.valueMinor ?? 0), 0);
    if (sum !== amountMinor) {
      const delta = amountMinor - sum;
      return delta > 0
        ? `$${(delta / 100).toFixed(2)} unassigned`
        : `over by $${((-delta) / 100).toFixed(2)}`;
    }
    return null;
  }
  if (mode === "percent") {
    const sum = entries.reduce((acc, e) => acc + (e.percentBps ?? 0), 0);
    if (sum !== 10000) {
      const delta = 10000 - sum;
      const fmt = (n: number) => (n / 100).toFixed(2).replace(/\.?0+$/, "");
      return delta > 0 ? `${fmt(delta)}% unassigned` : `over by ${fmt(-delta)}%`;
    }
    return null;
  }
  return "Unsupported split mode.";
}
