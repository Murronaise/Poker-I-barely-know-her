"use client";

// Tracks the currently-active live game session in sessionStorage so:
//   - the navbar's LIVE badge and "Resume Live Session" CTA find their way
//     back to the in-progress game after a navigation;
//   - a hard refresh mid-game restores the spreadsheet (buy-ins, busts,
//     rebuys, events, timer) instead of resetting to URL params.
//
// The pointer is `<gameId>|<startTimestampMs>`. We treat anything older
// than `STALE_AFTER_MS` as a forgotten session so the CTA doesn't haunt
// future loads — but the window is wide enough to survive a midnight
// rollover, which the old date-string check tripped on for marathon games.

import { useSyncExternalStore } from "react";
import { setSessionItem } from "./use-hydration";

const KEY = "liveGameId";
const STATE_KEY_PREFIX = "liveGameState:";
const SESSION_EVENT = "poker-tracker:sessionstorage";
// 18 hours covers any realistic single session and survives a midnight
// rollover that the old todayIso() check killed. Long enough to be useful,
// short enough that an abandoned game eventually clears itself.
const STALE_AFTER_MS = 18 * 60 * 60 * 1000;

// Reserved /games/<seg> children that aren't real live-game ids. If one of
// these slipped through the navbar's URL-watcher in an older build it still
// lives in sessionStorage today; we drop it on read so the dashboard doesn't
// keep showing "Join Live Game" linking to /games/poll.
const RESERVED_IDS = new Set(["create", "poll", "history"]);

function parse(stored: string | null): { id: string; startedAt: number } | null {
  if (!stored) return null;
  const [id, raw] = stored.split("|");
  if (!id) return null;
  if (RESERVED_IDS.has(id)) return null;
  const startedAt = Number(raw);
  // Older builds stored a YYYY-MM-DD date string here. We can't recover the
  // exact start time so treat them as stale — a one-time blip rather than
  // silently keeping a possibly-day-old session alive.
  if (!Number.isFinite(startedAt) || startedAt <= 0) return null;
  return { id, startedAt };
}

function isStale(startedAt: number): boolean {
  return Date.now() - startedAt > STALE_AFTER_MS;
}

/**
 * Stash the game id with a start timestamp. Calling repeatedly for the same
 * id keeps the original start time so the staleness window doesn't reset
 * just because the user navigated away and back.
 */
export function setLiveGameId(id: string): void {
  if (typeof window === "undefined") return;
  const existing = parse(sessionStorage.getItem(KEY));
  const startedAt = existing?.id === id ? existing.startedAt : Date.now();
  setSessionItem(KEY, `${id}|${startedAt}`);
}

/** Wipe the stored live game id AND its saved snapshot. */
export function clearLiveGameId(): void {
  if (typeof window !== "undefined") {
    const parsed = parse(sessionStorage.getItem(KEY));
    if (parsed) clearLiveGameState(parsed.id);
  }
  setSessionItem(KEY, null);
}

/** Imperative read — returns the id only if it's still inside the window. */
export function getLiveGameIdIfFresh(): string | null {
  if (typeof window === "undefined") return null;
  const parsed = parse(sessionStorage.getItem(KEY));
  if (!parsed) return null;
  if (isStale(parsed.startedAt)) {
    setSessionItem(KEY, null);
    clearLiveGameState(parsed.id);
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
 * Reactive hook returning the live game id only when it's still fresh.
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
  if (isStale(parsed.startedAt)) {
    if (typeof window !== "undefined") {
      const staleId = parsed.id;
      queueMicrotask(() => {
        setSessionItem(KEY, null);
        clearLiveGameState(staleId);
      });
    }
    return null;
  }
  return parsed.id;
}

// =========================================================================
// Live game state snapshot — restores the spreadsheet after a refresh.
// =========================================================================

/** Shape persisted to sessionStorage for an in-progress game. */
export type LiveGameSnapshot = {
  /** Snapshot format version. Bump when the shape changes. */
  v: 1;
  players: {
    name: string;
    avatar_url?: string;
    buyIn: number;
    foodSpend: number;
    cashOut: number | null;
  }[];
  events: {
    id: number;
    type: "rebuy" | "bust" | "level" | "undo" | "start" | "buyin";
    player?: string;
    amount?: number;
    label: string;
    /** ISO string — Date objects don't round-trip through JSON cleanly. */
    ts: string;
  }[];
  timer: {
    maxTime: number;
    timeLeft: number;
    isRunning: boolean;
  };
  blinds: {
    smallBlind: number;
    bigBlind: number;
    blindLevel: number;
  };
};

function stateKey(id: string): string {
  return `${STATE_KEY_PREFIX}${id}`;
}

export function saveLiveGameState(id: string, snapshot: LiveGameSnapshot): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(stateKey(id), JSON.stringify(snapshot));
  } catch {
    // Quota / private mode — silently drop the snapshot rather than break
    // the game.
  }
}

export function loadLiveGameState(id: string): LiveGameSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(stateKey(id));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LiveGameSnapshot;
    if (parsed?.v !== 1) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearLiveGameState(id: string): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(stateKey(id));
  } catch {
    // ignore
  }
}
