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

const subscribeStorage = (cb: () => void) => {
  window.addEventListener("storage", cb);
  return () => window.removeEventListener("storage", cb);
};

const getNullSnapshot = () => null;

// Reads a sessionStorage key in a hydration-safe way. Updates from other tabs
// trigger re-render via the `storage` event; same-tab writes are not observed
// (the consumer can read a fresh snapshot whenever it cares to re-render).
export function useSessionItem(key: string): string | null {
  return useSyncExternalStore(
    subscribeStorage,
    () => sessionStorage.getItem(key),
    getNullSnapshot,
  );
}
