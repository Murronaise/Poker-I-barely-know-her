// Running balance ledger across every historical session. Combines the
// session log (historicalGames) with the per-game `game_settlements` table
// to compute, per player, the total outstanding amount (signed) and a
// breakdown of which sessions still need settling.
//
// Sign convention (player-centric):
//   * negative  → player owes admin
//   * positive  → admin owes player (a winner who hasn't been paid)
//   * zero      → all square
//
// Food is folded into the combined number, matching the way the per-game
// settlement screen displays it. Players who happen to be the food payer
// don't pay themselves a food share. The admin themselves is excluded
// from the ledger entirely — they're the hub, not a participant in the
// outstanding pool.

import type { SupabaseClient } from "@supabase/supabase-js";
import { historicalGames, type HistoricalGame } from "./historical-games";
import { ADMIN_PLAYER, FOOD_PAYER } from "./local-store";
import { fetchEffectiveGames } from "./game-store";


export type LedgerSessionEntry = {
  gameId: string;
  date: string;
  /** Signed amount in pence — negative ⇒ player owes admin. */
  pence: number;
};

export type LedgerEntry = {
  /** Original-case name from the most recent session. */
  displayName: string;
  /** Sum of `pence` across every unsettled session. */
  outstandingPence: number;
  /** Sessions where this player still has an open balance. */
  unsettled: LedgerSessionEntry[];
};

/** Map of game_id → set of lower-cased player keys marked paid for that game. */
export type SettlementsByGame = Map<string, Set<string>>;

/**
 * Bulk-fetch every settled (game_id, player_key) record. Used by the
 * ledger page-loader — one query instead of one per game. Fails safe to
 * an empty map if the table doesn't exist yet.
 */
export async function loadAllSettlements(
  client: SupabaseClient,
): Promise<SettlementsByGame> {
  const out: SettlementsByGame = new Map();
  try {
    const { data, error } = await client
      .from("game_settlements")
      .select("game_id, player_key");
    if (error || !data) return out;
    data.forEach((row: { game_id: string; player_key: string }) => {
      if (!out.has(row.game_id)) out.set(row.game_id, new Set());
      out.get(row.game_id)!.add(row.player_key);
    });
  } catch {
    // Migration may not be applied — empty map is the safe failure mode.
  }
  return out;
}

/**
 * Walk the session log + settlement records and produce one ledger entry
 * per non-admin player. Pure compute — easy to unit-test, no I/O.
 */
export function computeLedger(
  games: readonly HistoricalGame[],
  settlements: SettlementsByGame,
): Map<string, LedgerEntry> {
  const adminLower = ADMIN_PLAYER.toLowerCase();
  const foodPayerLower = FOOD_PAYER.toLowerCase();
  const byPlayer = new Map<string, LedgerEntry>();

  // Walk chronologically (historicalGames is most-recent-first; reverse so
  // the "unsettled" list reads oldest-first and stays stable as new games
  // land at the top).
  [...games].reverse().forEach((g) => {
    const settledKeys = settlements.get(g.id) ?? new Set<string>();
    g.players.forEach((p) => {
      const key = p.name.toLowerCase();
      // Admin is the hub — they don't contribute to or take from the
      // outstanding pool. Their personal poker performance lands on
      // everyone else's row by definition.
      if (key === adminLower) return;
      // Already ticked off → nothing left to settle for this player on this
      // game.
      if (settledKeys.has(key)) return;

      const pokerNet = p.cashOut - p.buyIn;
      const foodOwed = key === foodPayerLower ? 0 : p.food;
      const combined = pokerNet - foodOwed; // signed
      // Skip zero-sum games — they don't move the needle.
      if (Math.abs(combined) < 0.005) return;

      const pence = Math.round(combined * 100);
      let entry = byPlayer.get(key);
      if (!entry) {
        entry = { displayName: p.name, outstandingPence: 0, unsettled: [] };
        byPlayer.set(key, entry);
      } else {
        // Keep the most recent capitalisation so renames propagate.
        entry.displayName = p.name;
      }
      entry.outstandingPence += pence;
      entry.unsettled.push({ gameId: g.id, date: g.date, pence });
    });
  });

  return byPlayer;
}

/**
 * Convenience: outstanding entry for a single player, or null if they're
 * all-square / never played.
 */
export function ledgerEntryFor(
  ledger: Map<string, LedgerEntry>,
  playerName: string,
): LedgerEntry | null {
  return ledger.get(playerName.toLowerCase()) ?? null;
}

/**
 * Server-side helper that bundles the fetch + compute so callers don't
 * have to assemble both halves themselves.
 */
export async function loadLedger(
  client: SupabaseClient,
  games?: HistoricalGame[],
): Promise<Map<string, LedgerEntry>> {
  const settlements = await loadAllSettlements(client);
  const gamesList = games ?? await fetchEffectiveGames(client);
  return computeLedger(gamesList, settlements);
}

/**
 * Format pence for a player-centric view: positive ⇒ they're owed money,
 * negative ⇒ they owe. Returns a sign + £ amount string ready for render.
 */
export function formatLedgerPence(pence: number): string {
  const abs = Math.abs(pence) / 100;
  return `${pence >= 0 ? "+" : "−"}£${abs.toFixed(2)}`;
}
