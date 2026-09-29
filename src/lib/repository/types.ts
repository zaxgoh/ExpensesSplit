/**
 * Repository interface. The app talks to this, never to storage directly, so
 * swapping the localStorage implementation for Firestore later is a file swap
 * rather than a rewrite. Every method is async to match the Firestore shape.
 */

import type { Expense, ExpensePeriod, Household, Member } from "@/types";

export type CreateExpenseInput = Omit<Expense, "id" | "createdAt" | "updatedAt">;
export type CreatePeriodInput = Omit<
  ExpensePeriod,
  "id" | "status" | "totalAmountMinor" | "expenseCount" | "settledAt" | "createdAt" | "updatedAt"
>;

export type Repository = {
  getHousehold(): Promise<Household | null>;
  createHousehold(name: string): Promise<Household>;

  listMembers(): Promise<Member[]>;
  createMember(name: string, avatar?: string): Promise<Member>;
  updateMember(id: string, patch: Partial<Member>): Promise<void>;
  archiveMember(id: string): Promise<void>;

  listPeriods(): Promise<ExpensePeriod[]>;
  createPeriod(input: CreatePeriodInput): Promise<ExpensePeriod>;
  updatePeriod(id: string, patch: Partial<ExpensePeriod>): Promise<void>;
  deletePeriod(id: string): Promise<void>;

  listExpenses(periodId: string): Promise<Expense[]>;
  createExpense(input: CreateExpenseInput): Promise<Expense>;
  updateExpense(id: string, periodId: string, patch: Partial<Expense>): Promise<void>;
  deleteExpense(id: string, periodId: string): Promise<void>;
};
