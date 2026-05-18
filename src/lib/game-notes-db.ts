// Supabase-backed admin-only notes per game. RLS rejects every operation
// unless the caller is `users.is_admin = true`, so non-admins can't even
// learn whether a note exists for a game.
//
// Reads run server-side from the history page so the textarea is
// pre-populated on first render; writes happen client-side from the
// edit modal.

import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "./supabase/client";

const TABLE = "game_notes";

export type GameNote = {
  note: string;
  updatedAt: string;
  updatedBy: string | null;
};

/**
 * Server-side read. Returns null for non-admins (RLS filters them out) and
 * for games that have never had a note saved.
 */
export async function fetchGameNote(
  client: SupabaseClient,
  gameId: string,
): Promise<GameNote | null> {
  try {
    const { data, error } = await client
      .from(TABLE)
      .select("note, updated_at, updated_by")
      .eq("game_id", gameId)
      .maybeSingle();
    if (error || !data) return null;
    return {
      note: data.note ?? "",
      updatedAt: data.updated_at,
      updatedBy: data.updated_by,
    };
  } catch {
    // Migration may not be applied yet — fail safe.
    return null;
  }
}

/**
 * Upsert the note for a game. Admin-only (enforced by RLS — UI gating is
 * defence-in-depth). Returns true on success so the caller can show a
 * toast or revert optimistic state.
 *
 * Empty notes delete the row rather than store empty strings, so the table
 * doesn't accumulate clutter for games that briefly had a draft.
 */
export async function saveGameNote(
  gameId: string,
  note: string,
): Promise<boolean> {
  const sb = createSupabaseBrowserClient();
  const trimmed = note.trim();
  if (trimmed.length === 0) {
    const { error } = await sb.from(TABLE).delete().eq("game_id", gameId);
    if (error) throw error;
    return true;
  }
  const { data: { user } } = await sb.auth.getUser();
  const { error } = await sb.from(TABLE).upsert(
    {
      game_id: gameId,
      note: trimmed,
      updated_by: user?.id ?? null,
    },
    { onConflict: "game_id" },
  );
  if (error) throw error;
  return true;
}
