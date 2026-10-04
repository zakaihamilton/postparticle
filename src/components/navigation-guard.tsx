"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import styles from "./navigation-guard.module.css";

interface Guard {
  register: (key: symbol, blocked: boolean) => void;
  unregister: (key: symbol) => void;
  isBlocked: () => boolean;
  confirmNavigation: (confirmLabel?: string) => Promise<boolean>;
}

const NavigationGuard = createContext<Guard>({
  register: () => {},
  unregister: () => {},
  isBlocked: () => false,
  confirmNavigation: async () => true,
});

interface ConfirmationPrompt {
  confirmLabel: string;
}

export function NavigationGuardProvider({ children }: { children: ReactNode }) {
  const blockers = useRef(new Map<symbol, boolean>());
  const pendingResolve = useRef<((confirmed: boolean) => void) | null>(null);
  const [prompt, setPrompt] = useState<ConfirmationPrompt | null>(null);
  const stayButton = useRef<HTMLButtonElement>(null);
  const continueButton = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLElement>(null);

  const isBlocked = useCallback(
    () => [...blockers.current.values()].some(Boolean),
    [],
  );

  const confirmNavigation = useCallback(
    (confirmLabel = "Leave and discard") => {
      if (!isBlocked()) return Promise.resolve(true);
      if (pendingResolve.current) return Promise.resolve(false);

      return new Promise<boolean>((resolve) => {
        pendingResolve.current = resolve;
        setPrompt({ confirmLabel });
      });
    },
    [isBlocked],
  );

  const settlePrompt = useCallback((confirmed: boolean) => {
    const resolve = pendingResolve.current;
    pendingResolve.current = null;
    setPrompt(null);
    resolve?.(confirmed);
  }, []);

  const guard = useMemo<Guard>(
    () => ({
      register: (key, blocked) => blockers.current.set(key, blocked),
      unregister: (key) => blockers.current.delete(key),
      isBlocked,
      confirmNavigation,
    }),
    [confirmNavigation, isBlocked],
  );

  useEffect(() => {
    if (!prompt) return;

    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    stayButton.current?.focus();

    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        settlePrompt(false);
      } else if (event.key === "Tab") {
        if (!dialog.current?.contains(document.activeElement)) {
          event.preventDefault();
          stayButton.current?.focus();
        } else if (
          event.shiftKey &&
          document.activeElement === stayButton.current
        ) {
          event.preventDefault();
          continueButton.current?.focus();
        } else if (
          !event.shiftKey &&
          document.activeElement === continueButton.current
        ) {
          event.preventDefault();
          stayButton.current?.focus();
        }
      }
    }
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus();
    };
  }, [prompt, settlePrompt]);

  return (
    <NavigationGuard.Provider value={guard}>
      {children}
      {prompt && (
        <div className={styles.overlay}>
          <button
            type="button"
            className={styles.backdrop}
            aria-label="Stay on this page"
            tabIndex={-1}
            onClick={() => settlePrompt(false)}
          />
          <section
            ref={dialog}
            className={styles.dialog}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="navigation-confirm-title"
            aria-describedby="navigation-confirm-description"
          >
            <h2 id="navigation-confirm-title">Unsaved changes</h2>
            <p id="navigation-confirm-description">
              You have unsaved changes or an operation in progress. Continue and
              discard your unsaved changes?
            </p>
            <div className={styles.actions}>
              <button
                ref={stayButton}
                type="button"
                className={styles.stay}
                onClick={() => settlePrompt(false)}
              >
                Stay
              </button>
              <button
                ref={continueButton}
                type="button"
                className={styles.continue}
                onClick={() => settlePrompt(true)}
              >
                {prompt.confirmLabel}
              </button>
            </div>
          </section>
        </div>
      )}
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

type GuardedLinkProps = Omit<ComponentProps<typeof Link>, "onNavigate">;

export function GuardedLink({
  href,
  replace,
  scroll,
  ...props
}: GuardedLinkProps) {
  const router = useRouter();
  const { confirmNavigation, isBlocked } = useNavigationGuard();
  const anchor = useRef<HTMLAnchorElement>(null);

  return (
    <Link
      {...props}
      ref={anchor}
      href={href}
      replace={replace}
      scroll={scroll}
      onNavigate={(event) => {
        if (!isBlocked()) return;

        event.preventDefault();
        const currentHref = anchor.current?.href;
        if (!currentHref) return;
        const targetUrl = new URL(currentHref);
        const target = `${targetUrl.pathname}${targetUrl.search}${targetUrl.hash}`;

        void confirmNavigation().then((confirmed) => {
          if (!confirmed) return;
          const options = { scroll: scroll ?? true };
          if (replace) router.replace(target, options);
          else router.push(target, options);
        });
      }}
    />
  );
}
