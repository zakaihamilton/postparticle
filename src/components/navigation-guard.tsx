"use client";

import Link from "next/link";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type ComponentProps,
  type ReactNode,
} from "react";

interface Guard {
  register: (key: symbol, blocked: boolean) => void;
  unregister: (key: symbol) => void;
  confirmNavigation: () => boolean;
}
const NavigationGuard = createContext<Guard>({
  register: () => {},
  unregister: () => {},
  confirmNavigation: () => true,
});

export function NavigationGuardProvider({ children }: { children: ReactNode }) {
  const guard = useMemo(() => {
    const blockers = new Map<symbol, boolean>();
    return {
      register: (key: symbol, blocked: boolean) => {
        blockers.set(key, blocked);
      },
      unregister: (key: symbol) => {
        blockers.delete(key);
      },
      confirmNavigation: () =>
        ![...blockers.values()].some(Boolean) ||
        window.confirm(
          "You have unsaved changes or an operation in progress. Leave this page and discard unsaved changes?",
        ),
    };
  }, []);
  return (
    <NavigationGuard.Provider value={guard}>
      {children}
    </NavigationGuard.Provider>
  );
}
export function useNavigationGuard() {
  return useContext(NavigationGuard);
}
export function useUnsavedChanges(blocked: boolean) {
  const guard = useNavigationGuard();
  const key = useMemo(() => Symbol("editor"), []);
  useEffect(() => {
    guard.register(key, blocked);
    return () => guard.unregister(key);
  }, [guard, key, blocked]);
}
export function GuardedLink({
  onNavigate,
  ...props
}: ComponentProps<typeof Link>) {
  const { confirmNavigation } = useNavigationGuard();
  return (
    <Link
      {...props}
      onNavigate={(event) => {
        if (!confirmNavigation()) event.preventDefault();
        else onNavigate?.(event);
      }}
    />
  );
}
