// Supabase-backed settlement state. Replaces the previous localStorage-only
// implementation so non-admin players can also see who's been marked paid.
//
// Reads run on the server (history page) using the anon key — RLS allows
// SELECT for everyone. Writes happen client-side from the admin's settle
// button; RLS rejects non-admins even if the UI guard is bypassed.

import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "./supabase/client";

const TABLE = "game_settlements";

/**
 * Per-row metadata for a settled payment — used to render "paid 2 days ago
 * by Toby" subtitles next to each tick. `settledByName` is resolved from
 * the joined users row (case-insensitive `users.player_name`) when
 * available; null for tickers without a matching profile row.
 */
export type SettlementRecord = {
  playerKey: string;
  settledAt: string;
  settledByName: string | null;
};

/** Lower-cased player names that have been ticked off as paid for this game. */
export async function fetchSettledPlayers(
  client: SupabaseClient,
  gameId: string,
): Promise<Set<string>> {
  const records = await fetchSettlementRecords(client, gameId);
  return new Set(records.keys());
}

/**
 * Richer fetch returning a map of player_key → settlement metadata, so the
 * UI can render "paid {time} by {admin}" badges alongside the tick. Falls
 * back to an empty map on RLS rejection / missing table.
 */
export async function fetchSettlementRecords(
  client: SupabaseClient,
  gameId: string,
): Promise<Map<string, SettlementRecord>> {
  const out = new Map<string, SettlementRecord>();
  // Embed the joined user row's player_name when available so we can label
  // the tick with who marked it. Supabase resolves this via the
  // `settled_by` FK to auth.users; the public.users row is joined manually
  // since there's no FK between the two.
  try {
    const { data, error } = await client
      .from(TABLE)
      .select("player_key, settled_at, settled_by")
      .eq("game_id", gameId);
    if (error || !data) return out;

    // Bulk-resolve the user_ids → player_name in a second round trip so we
    // don't trigger a slow N+1 of per-row joins on a fresh deploy where
    // PostgREST's auto-join isn't configured.
    const userIds = Array.from(
      new Set(
        data
          .map((r: { settled_by: string | null }) => r.settled_by)
          .filter((id): id is string => Boolean(id)),
      ),
    );
    const nameById = new Map<string, string>();
    if (userIds.length > 0) {
      const { data: users } = await client
        .from("users")
        .select("user_id, player_name")
        .in("user_id", userIds);
      (users ?? []).forEach((u: { user_id: string; player_name: string }) => {
        nameById.set(u.user_id, u.player_name);
      });
    }

    data.forEach((row: {
      player_key: string;
      settled_at: string;
      settled_by: string | null;
    }) => {
      out.set(row.player_key, {
        playerKey: row.player_key,
        settledAt: row.settled_at,
        settledByName: row.settled_by ? (nameById.get(row.settled_by) ?? null) : null,
      });
    });
  } catch {
    // Table missing or RLS rejection — treat as nothing-settled, which is
    // the safe failure mode for read paths.
  }
  return out;
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
