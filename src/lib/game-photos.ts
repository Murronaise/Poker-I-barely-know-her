// Game-photo helpers — chip stacks, food spreads, anything worth keeping
// from a session. Photos live in the `game-photos` storage bucket and are
// indexed by the `game_photos` table so we can join + render thumbnails
// on the history page without paying a list-bucket cost.

import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "./supabase/client";

export const PHOTO_BUCKET = "game-photos";
export const PHOTO_MAX_BYTES = 8 * 1024 * 1024; // 8 MB
export const PHOTO_ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

export type GamePhoto = {
  id: number;
  gameId: string;
  url: string;
  caption: string | null;
  uploadedAt: string;
  uploadedBy: string | null;
};

export async function fetchPhotosForGame(
  client: SupabaseClient,
  gameId: string,
): Promise<GamePhoto[]> {
  try {
    const { data, error } = await client
      .from("game_photos")
      .select("id, game_id, storage_path, caption, uploaded_at, uploaded_by")
      .eq("game_id", gameId)
      .order("uploaded_at", { ascending: false });
    if (error || !data) return [];
    return data.map((r: {
      id: number;
      game_id: string;
      storage_path: string;
      caption: string | null;
      uploaded_at: string;
      uploaded_by: string | null;
    }) => ({
      id: r.id,
      gameId: r.game_id,
      url: client.storage.from(PHOTO_BUCKET).getPublicUrl(r.storage_path).data.publicUrl,
      caption: r.caption,
      uploadedAt: r.uploaded_at,
      uploadedBy: r.uploaded_by,
    }));
  } catch {
    return [];
  }
}

/**
 * Upload a photo + register it in the index table. Throws on any failure
 * so the caller can surface the right toast — partial state (upload
 * succeeded but index insert failed) leaves the object orphaned in
 * storage; that's worth a follow-up cron later.
 */
export async function uploadGamePhoto(
  gameId: string,
  file: File,
  caption?: string,
): Promise<GamePhoto> {
  if (file.size > PHOTO_MAX_BYTES) {
    throw new Error(`Photos must be under ${Math.round(PHOTO_MAX_BYTES / (1024 * 1024))} MB.`);
  }
  if (!PHOTO_ALLOWED_TYPES.has(file.type)) {
    throw new Error("Only JPG, PNG, WEBP, or HEIC files are accepted.");
  }
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const safeExt = /^[a-z0-9]+$/.test(ext) ? ext : "jpg";
  const path = `${gameId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${safeExt}`;

  const sb = createSupabaseBrowserClient();
  const { error: uploadErr } = await sb.storage
    .from(PHOTO_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (uploadErr) throw uploadErr;

  const { data: { user } } = await sb.auth.getUser();
  const { data: inserted, error: insertErr } = await sb
    .from("game_photos")
    .insert({
      game_id: gameId,
      storage_path: path,
      caption: caption?.trim() || null,
      uploaded_by: user?.id ?? null,
    })
    .select("id, game_id, storage_path, caption, uploaded_at, uploaded_by")
    .single();
  if (insertErr || !inserted) {
    // Best-effort: try to clean up the orphan object.
    void sb.storage.from(PHOTO_BUCKET).remove([path]);
    throw insertErr ?? new Error("Couldn't register the uploaded photo.");
  }

  return {
    id: inserted.id,
    gameId: inserted.game_id,
    url: sb.storage.from(PHOTO_BUCKET).getPublicUrl(inserted.storage_path).data.publicUrl,
    caption: inserted.caption,
    uploadedAt: inserted.uploaded_at,
    uploadedBy: inserted.uploaded_by,
  };
}

export async function deleteGamePhoto(id: number, storagePath: string): Promise<void> {
  const sb = createSupabaseBrowserClient();
  // Delete the index row first — if storage delete fails after, the row
  // is gone and an orphan file lives in the bucket, which a janitor cron
  // can clean. The other order (storage first) leaves a broken thumbnail
  // dangling if the row delete fails.
  const { error: rowErr } = await sb.from("game_photos").delete().eq("id", id);
  if (rowErr) throw rowErr;
  void sb.storage.from(PHOTO_BUCKET).remove([storagePath]);
}
