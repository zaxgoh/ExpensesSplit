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
import { localRepository } from "@/lib/repository/local";
import type { Repository } from "@/lib/repository/types";
import type { Household, Member } from "@/types";

type HouseholdContextValue = {
  repository: Repository;
  household: Household | null;
  members: Member[];
  ready: boolean;
  reloadMembers: () => Promise<void>;
  setHousehold: (household: Household) => void;
};

const HouseholdContext = createContext<HouseholdContextValue | null>(null);

export function HouseholdProvider({
  children,
  repository = localRepository,
}: {
  children: ReactNode;
  repository?: Repository;
}) {
  const [household, setHousehold] = useState<Household | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [ready, setReady] = useState(false);

  const reloadMembers = useCallback(async () => {
    setMembers(await repository.listMembers());
  }, [repository]);

  useEffect(() => {
    let active = true;
    (async () => {
      const [existing, loadedMembers] = await Promise.all([
        repository.getHousehold(),
        repository.listMembers(),
      ]);
      if (!active) return;
      setHousehold(existing);
      setMembers(loadedMembers);
      setReady(true);
    })();
    return () => {
      active = false;
    };
  }, [repository]);

  const value = useMemo(
    () => ({ repository, household, members, ready, reloadMembers, setHousehold }),
    [repository, household, members, ready, reloadMembers],
  );

  return <HouseholdContext.Provider value={value}>{children}</HouseholdContext.Provider>;
}

export function useHousehold(): HouseholdContextValue {
  const context = useContext(HouseholdContext);
  if (!context) throw new Error("useHousehold must be used inside <HouseholdProvider>");
  return context;
}
