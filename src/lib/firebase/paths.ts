import type { ISODate } from "@/types";

/**
 * Firestore path builders. Every document address in the app is built here so
 * the layout in PLAN.md §3 is stated once:
 *
 *   households/{householdId}
 *   households/{householdId}/members/{memberId}
 *   households/{householdId}/periods/{periodId}
 *   households/{householdId}/periods/{periodId}/expenses/{expenseId}
 *   households/{householdId}/meta/categories
 */

export const householdDoc = (householdId: string) => `households/${householdId}`;

export const membersCol = (householdId: string) =>
  `households/${householdId}/members`;

export const memberDoc = (householdId: string, memberId: string) =>
  `households/${householdId}/members/${memberId}`;

export const periodsCol = (householdId: string) => `households/${householdId}/periods`;

export const periodDoc = (householdId: string, periodId: string) =>
  `households/${householdId}/periods/${periodId}`;

export const expensesCol = (householdId: string, periodId: string) =>
  `households/${householdId}/periods/${periodId}/expenses`;

export const expenseDoc = (householdId: string, periodId: string, expenseId: string) =>
  `households/${householdId}/periods/${periodId}/expenses/${expenseId}`;

export const categoriesDoc = (householdId: string) =>
  `households/${householdId}/meta/categories`;

/** Seeded at household creation so `categoryId` always resolves to something. */
export const DEFAULT_CATEGORIES = [
  { id: "groceries", label: "Groceries", icon: "🛒", colorHex: "#4ADE80" },
  { id: "utilities", label: "Utilities", icon: "💡", colorHex: "#FBBF24" },
  { id: "rent", label: "Rent", icon: "🏠", colorHex: "#818CF8" },
  { id: "transport", label: "Transport", icon: "🚗", colorHex: "#60A5FA" },
  { id: "dining", label: "Dining", icon: "🍽️", colorHex: "#FB923C" },
  { id: "household", label: "Household", icon: "🏡", colorHex: "#22D3EE" },
  { id: "health", label: "Health", icon: "🩺", colorHex: "#F87171" },
  { id: "entertainment", label: "Entertainment", icon: "🎬", colorHex: "#C084FC" },
  { id: "other", label: "Other", icon: "📦", colorHex: "#8A93A6" },
] as const;

export type { ISODate };
