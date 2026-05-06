// Client-only utility for merging hardcoded game data with localStorage overlays.
// Use only from client components ("use client").
// Never call from server components — this reads localStorage which doesn't exist server-side.

import { historicalGames, type HistoricalGame } from "./historical-games";
import { getDeletedGameIds, getGamePatch } from "./local-store";

export function getEffectiveHistoricalGames(): HistoricalGame[] {
  // SSR fallback: return hardcoded data if we're on the server.
  if (typeof window === "undefined") {
    return historicalGames;
  }

  const deleted = getDeletedGameIds();
  return historicalGames
    .filter((g) => !deleted.has(g.id))
    .map((g) => {
      const patch = getGamePatch(g.id);
      if (!patch) return g;
      // Merge patch: only top-level fields like date, duration, location,
      // totalPot, blinds. The players array stays as-is.
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
