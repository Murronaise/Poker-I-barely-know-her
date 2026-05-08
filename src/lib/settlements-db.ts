// Supabase-backed settlement state. Replaces the previous localStorage-only
// implementation so non-admin players can also see who's been marked paid.
//
// Reads run on the server (history page) using the anon key — RLS allows
// SELECT for everyone. Writes happen client-side from the admin's settle
// button; RLS rejects non-admins even if the UI guard is bypassed.

import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "./supabase/client";

const TABLE = "game_settlements";

/** Lower-cased player names that have been ticked off as paid for this game. */
export async function fetchSettledPlayers(
  client: SupabaseClient,
  gameId: string,
): Promise<Set<string>> {
  const { data, error } = await client
    .from(TABLE)
    .select("player_key")
    .eq("game_id", gameId);
  if (error || !data) return new Set();
  return new Set(data.map((r: { player_key: string }) => r.player_key));
}

/**
 * Toggle a player's settled status. Returns the new boolean (true = settled).
 *
 * Uses the SSR-aware browser client so the request carries the admin's auth
 * cookie. The plain `supabase` client reads its session from localStorage,
 * which is empty under our cookie-based auth setup — using it here would
 * send the request unauthenticated and trip a 401 from RLS.
 */
export async function togglePlayerSettledDb(
  gameId: string,
  playerName: string,
  currentlySettled: boolean,
): Promise<boolean> {
  const sb = createSupabaseBrowserClient();
  const playerKey = playerName.toLowerCase();
  if (currentlySettled) {
    const { error } = await sb
      .from(TABLE)
      .delete()
      .eq("game_id", gameId)
      .eq("player_key", playerKey);
    if (error) throw error;
    return false;
  }
  const { data: { user } } = await sb.auth.getUser();
  const { error } = await sb.from(TABLE).insert({
    game_id: gameId,
    player_key: playerKey,
    player_name: playerName,
    settled_by: user?.id ?? null,
  });
  if (error) throw error;
  return true;
}

/** Wipe every per-player tick for a game. Admin-only via RLS. */
export async function clearGameSettlementDb(gameId: string): Promise<void> {
  const sb = createSupabaseBrowserClient();
  const { error } = await sb
    .from(TABLE)
    .delete()
    .eq("game_id", gameId);
  if (error) throw error;
}
