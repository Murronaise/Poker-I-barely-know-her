"use client";

import { useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};
const trueSnapshot = () => true;
const falseSnapshot = () => false;

// Returns false during SSR / first render, true once hydrated. Safe replacement
// for the `setIsMounted(true)` in useEffect pattern (which trips React 19's
// react-hooks/set-state-in-effect rule).
export function useIsMounted(): boolean {
  return useSyncExternalStore(noopSubscribe, trueSnapshot, falseSnapshot);
}

const SESSION_EVENT = "poker-tracker:sessionstorage";

const subscribeStorage = (cb: () => void) => {
  window.addEventListener("storage", cb);
  window.addEventListener(SESSION_EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(SESSION_EVENT, cb);
  };
};

const getNullSnapshot = () => null;

// Reads a sessionStorage key in a hydration-safe way. Cross-tab updates use the
// native `storage` event; same-tab writes must be made via `setSessionItem`
// below so subscribers get notified.
export function useSessionItem(key: string): string | null {
  return useSyncExternalStore(
    subscribeStorage,
    () => sessionStorage.getItem(key),
    getNullSnapshot,
  );
}

export function setSessionItem(key: string, value: string | null) {
  if (typeof window === "undefined") return;
  if (value === null) sessionStorage.removeItem(key);
  else sessionStorage.setItem(key, value);
  window.dispatchEvent(new CustomEvent(SESSION_EVENT));
}
