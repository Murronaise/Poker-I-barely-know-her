"use client";

// Registers `/sw.js` on the client so installs + push notifications work.
// Mounted once from the root layout — render-tree position doesn't
// matter since it produces no DOM.
//
// Suppressed in development to avoid stale service workers caching a
// half-broken bundle while iterating.

import { useEffect } from "react";

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;

    const register = async () => {
      try {
        await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      } catch (err) {
        // Failures here are non-fatal — the app works without the SW;
        // only PWA install + offline shell are affected.
        console.warn("[sw] registration failed", err);
      }
    };
    register();
  }, []);

  return null;
}
