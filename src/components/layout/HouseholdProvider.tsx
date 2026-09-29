"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { firestoreRepository } from "@/lib/repository/firestore";
import type { Repository } from "@/lib/repository/types";
import type { Category, ExpensePeriod, Household, Member } from "@/types";

export type HouseholdStatus = "loading" | "ready" | "error";

type HouseholdContextValue = {
  repository: Repository;
  household: Household | null;
  members: Member[];
  periods: ExpensePeriod[];
  categories: Category[];
  status: HouseholdStatus;
  error: Error | null;
  /** True once the household document has resolved, either way. */
  ready: boolean;
  reloadMembers: () => Promise<void>;
  reloadPeriods: () => Promise<void>;
  setHousehold: (household: Household) => void;
};

const HouseholdContext = createContext<HouseholdContextValue | null>(null);

/**
 * Owns the household-scoped realtime subscriptions (§5). One `onSnapshot` per
 * collection, scoped to the household path, delivered here rather than in each
 * component. Nothing financial is cached in client state beyond what these
 * collections already hold — balances and totals are derived with `useMemo`.
 */
export function HouseholdProvider({
  children,
  repository = firestoreRepository,
}: {
  children: ReactNode;
  repository?: Repository;
}) {
  const [household, setHousehold] = useState<Household | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [periods, setPeriods] = useState<ExpensePeriod[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [status, setStatus] = useState<HouseholdStatus>("loading");
  const [error, setError] = useState<Error | null>(null);

  const fail = useCallback((err: Error) => {
    setError(err);
    setStatus("error");
  }, []);

  const reloadMembers = useCallback(async () => {
    setMembers(await repository.listMembers());
  }, [repository]);

  const reloadPeriods = useCallback(async () => {
    setPeriods(await repository.listPeriods());
  }, [repository]);

  useEffect(() => {
    let active = true;
    const handle = <T,>(apply: (value: T) => void) => (value: T) => {
      if (active) apply(value);
    };

    const unsubscribes = [
      repository.subscribeHousehold(
        handle((next) => {
          setHousehold(next);
          // Resolved either way: a missing document is the first-run state, not
          // a failure, and it is what routes to /setup.
          setStatus((current) => (current === "error" ? current : "ready"));
        }),
        fail,
      ),
      repository.subscribeMembers(handle(setMembers), fail),
      repository.subscribePeriods(handle(setPeriods), fail),
      repository.subscribeCategories(handle(setCategories), fail),
    ];

    return () => {
      active = false;
      unsubscribes.forEach((unsubscribe) => unsubscribe());
    };
  }, [repository, fail]);

  const value = useMemo(
    () => ({
      repository,
      household,
      members,
      periods,
      categories,
      status,
      error,
      ready: status !== "loading",
      reloadMembers,
      reloadPeriods,
      setHousehold,
    }),
    [repository, household, members, periods, categories, status, error, reloadMembers, reloadPeriods],
  );

  return (
    <HouseholdContext.Provider value={value}>
      {children}
      {status === "error" ? (
        <div
          role="alert"
          className="fixed inset-x-0 bottom-0 z-50 border-t border-negative/40 bg-negative/10 p-3 text-sm text-negative"
        >
          {error?.message ?? "Could not reach the database."} Changes made now may not be saved.
        </div>
      ) : null}
    </HouseholdContext.Provider>
  );
}

export function useHousehold(): HouseholdContextValue {
  const context = useContext(HouseholdContext);
  if (!context) throw new Error("useHousehold must be used inside <HouseholdProvider>");
  return context;
}
