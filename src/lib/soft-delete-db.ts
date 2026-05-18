// Supabase-backed soft-delete overlay for historical games. Replaces the
// localStorage-only `deletedGameIds` set with a synced table so an admin
// deleting a game from one device sees it gone everywhere — and so the
// "restore" affordance can list previously-deleted games across the org.
//
// Reads are public (RLS allows SELECT for everyone) so the games index can
// hide deleted entries without an authed round-trip. Writes are admin-only.

import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "./supabase/client";
import { recordAudit } from "./audit-log";

const TABLE = "deleted_games";

export type DeletedGameRecord = {
  gameId: string;
  deletedAt: string;
  deletedBy: string | null;
  reason: string | null;
};

/** Lower-cost lookup: just the set of deleted game ids. */
export async function fetchDeletedGameIds(
  client: SupabaseClient,
): Promise<Set<string>> {
  try {
    const { data, error } = await client.from(TABLE).select("game_id");
    if (error || !data) return new Set();
    return new Set(data.map((r: { game_id: string }) => r.game_id));
  } catch {
    return new Set();
  }
}

/** Richer listing for the admin restore page — includes timestamps. */
export async function fetchDeletedGameRecords(
  client: SupabaseClient,
): Promise<DeletedGameRecord[]> {
  try {
    const { data, error } = await client
      .from(TABLE)
      .select("game_id, deleted_at, deleted_by, reason")
      .order("deleted_at", { ascending: false });
    if (error || !data) return [];
    return data.map((r: {
      game_id: string;
      deleted_at: string;
      deleted_by: string | null;
      reason: string | null;
    }) => ({
      gameId: r.game_id,
      deletedAt: r.deleted_at,
      deletedBy: r.deleted_by,
      reason: r.reason,
    }));
  } catch {
    return [];
  }
}

export async function softDeleteGame(
  gameId: string,
  reason?: string,
): Promise<void> {
  const sb = createSupabaseBrowserClient();
  const { data: { user } } = await sb.auth.getUser();
  const { error } = await sb.from(TABLE).insert({
    game_id: gameId,
    deleted_by: user?.id ?? null,
    reason: reason ?? null,
  });
  if (error) throw error;
  // Best-effort audit. Fire-and-forget so a slow audit insert doesn't
  // delay the UI update.
  void recordAudit("game", gameId, "soft_delete", reason ? { reason } : undefined);
}

export async function restoreGame(gameId: string): Promise<void> {
  const sb = createSupabaseBrowserClient();
  const { error } = await sb.from(TABLE).delete().eq("game_id", gameId);
  if (error) throw error;
  void recordAudit("game", gameId, "restore");
}
