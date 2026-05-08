"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

const RATE_LIMIT_MS = 60_000; // one visit row per path per 60s per browser

/**
 * Fires a fire-and-forget POST to /api/track-visit on every client-side
 * navigation. Mounted once in the root layout. Rate-limited per path to
 * keep the visits table sane for noisy users.
 */
export default function VisitTracker() {
  const pathname = usePathname();
  // Last-logged time per path. Survives navigations within a single browser
  // tab; resets on hard reload (which is also when we want to log again).
  const lastSentRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    if (!pathname) return;
    const now = Date.now();
    const last = lastSentRef.current.get(pathname) ?? 0;
    if (now - last < RATE_LIMIT_MS) return;
    lastSentRef.current.set(pathname, now);

    fetch("/api/track-visit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: pathname }),
      // keepalive lets the request finish even if the user navigates away
      // mid-flight (small payload, well under the 64KB limit).
      keepalive: true,
    }).catch(() => {
      // Silent — tracking failures shouldn't disturb the user. Drop the
      // last-sent stamp so the next pathname change retries.
      lastSentRef.current.delete(pathname);
    });
  }, [pathname]);

  return null;
}
