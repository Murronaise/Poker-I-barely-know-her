"use client";

// Tracks the currently-active live game session in sessionStorage. The value
// is stored as `<gameId>|<YYYY-MM-DD>` — the date is the day the session was
// started. On read, we ignore (and clear) entries from any earlier day so
// the navbar's LIVE badge and the dashboard's "Resume Live Session" CTA
// only appear on the day the game is actually being played.

import { useSyncExternalStore } from "react";
import { setSessionItem } from "./use-hydration";

const KEY = "liveGameId";
const SESSION_EVENT = "poker-tracker:sessionstorage";

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parse(stored: string | null): { id: string; date: string } | null {
  if (!stored) return null;
  const [id, date] = stored.split("|");
  if (!id || !date) return null;
  return { id, date };
}

/**
 * Stash the game id along with today's date. Use whenever we land on a
 * /games/[id] route so the persistent CTA can pick it back up after navigation.
 */
export function setLiveGameId(id: string): void {
  setSessionItem(KEY, `${id}|${todayIso()}`);
}

/** Wipe the stored live game id (e.g. game ended). */
export function clearLiveGameId(): void {
  setSessionItem(KEY, null);
}

/** Imperative read — returns the id only if it was stored today. */
export function getLiveGameIdIfFresh(): string | null {
  if (typeof window === "undefined") return null;
  const parsed = parse(sessionStorage.getItem(KEY));
  if (!parsed) return null;
  if (parsed.date !== todayIso()) {
    // Stale — clear so it stops haunting future loads.
    setSessionItem(KEY, null);
    return null;
  }
  return parsed.id;
}

const subscribeStorage = (cb: () => void) => {
  window.addEventListener("storage", cb);
  window.addEventListener(SESSION_EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(SESSION_EVENT, cb);
  };
};

const ssrNullSnapshot = () => null;

/**
 * Reactive hook returning the live game id only when it was stored today.
 * Stale entries are cleared as a side-effect on read.
 */
export function useLiveGameId(): string | null {
  const raw = useSyncExternalStore(
    subscribeStorage,
    () => sessionStorage.getItem(KEY),
    ssrNullSnapshot,
  );
  const parsed = parse(raw);
  if (!parsed) return null;
  if (parsed.date !== todayIso()) {
    // Defer the clear so we don't write inside the snapshot read.
    if (typeof window !== "undefined") {
      queueMicrotask(() => setSessionItem(KEY, null));
    }
    return null;
  }
  return parsed.id;
}
