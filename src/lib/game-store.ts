// Client-only utility for merging hardcoded game data with overlays
// (Supabase + localStorage). Use only from client components ("use client").
// Never call from server components — this reads localStorage which
// doesn't exist server-side.

import { historicalGames, type HistoricalGame } from "./historical-games";
import { getDeletedGameIds, getGamePatch } from "./local-store";

/**
 * Synchronous version — uses localStorage overlays only. Kept for the
 * places that need a non-async value (initial render before Supabase
 * resolves). Components that can `await` should prefer
 * `getEffectiveHistoricalGamesWith()` and pass a fetched deletedSet.
 */
export function getEffectiveHistoricalGames(): HistoricalGame[] {
  // SSR fallback: return hardcoded data if we're on the server.
  if (typeof window === "undefined") {
    return historicalGames;
  }

  const deleted = getDeletedGameIds();
  return getEffectiveHistoricalGamesWith(deleted);
}

/**
 * Async-friendly overload — caller passes in the Supabase-derived deleted
 * set (merged with the localStorage set in the caller, typically). Keeps
 * this module free of Supabase dependencies so server components can
 * still import it for the bare historicalGames passthrough.
 */
export function getEffectiveHistoricalGamesWith(
  deleted: Set<string>,
): HistoricalGame[] {
  return historicalGames
    .filter((g) => !deleted.has(g.id))
    .map((g) => {
      // localStorage patches are still legacy — kept until soft-edit DB
      // arrives in a later phase.
      const patch = typeof window !== "undefined" ? getGamePatch(g.id) : null;
      if (!patch) return g;
      return {
        ...g,
        date: (patch.date as string) ?? g.date,
        duration: (patch.duration as string) ?? g.duration,
        location: (patch.location as string) ?? g.location,
        totalPot: (patch.totalPot as number) ?? g.totalPot,
        blinds: (patch.blinds as string) ?? g.blinds,
      };
    });
}

export function getEffectiveGame(id: string): HistoricalGame | undefined {
  return getEffectiveHistoricalGames().find((g) => g.id === id);
}
