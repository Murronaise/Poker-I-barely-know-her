"use client";

// Server-rendered list of attached photos for a game + per-player upload
// affordances. Each player in the game roster gets a small camera button
// next to their avatar; tapping opens the device's camera / gallery and
// the uploaded photo is tagged with that player's name. A separate
// "Untagged" slot covers food / scene shots.
//
// Photos render as a thumbnail grid with the tagged player overlaid on
// each card so it's obvious whose stack is whose.

import { useEffect, useRef, useState } from "react";
import { Camera, Loader2, Trash2, X, Tag } from "lucide-react";
import { toast } from "sonner";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  deleteGamePhoto,
  fetchPhotosForGame,
  uploadGamePhoto,
  type GamePhoto,
} from "@/lib/game-photos";
import PlayerAvatar from "@/components/PlayerAvatar";

type Props = {
  gameId: string;
  /** Players in this game — used to render per-player upload affordances. */
  players: { name: string; avatarUrl?: string }[];
  /** When true, render the upload affordances. */
  canUpload: boolean;
};

export default function GamePhotos({ gameId, players, canUpload }: Props) {
  const [photos, setPhotos] = useState<GamePhoto[]>([]);
  const [loading, setLoading] = useState(true);
  // Tracks which player slot is currently uploading so we can disable just
  // that button and show a spinner instead of disabling the whole panel.
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  const [viewer, setViewer] = useState<GamePhoto | null>(null);
  // One hidden input is enough — we set the pending player name in state
  // immediately before the file dialog opens, then read it back in the
  // change handler.
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingPlayerRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const sb = createSupabaseBrowserClient();
      const list = await fetchPhotosForGame(sb, gameId);
      if (!cancelled) {
        setPhotos(list);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [gameId]);

  const openPicker = (playerName: string | null) => {
    pendingPlayerRef.current = playerName;
    setUploadingFor(playerName ?? "__untagged__");
    fileInputRef.current?.click();
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const tag = pendingPlayerRef.current;
    e.target.value = "";
    pendingPlayerRef.current = null;
    if (!file) {
      setUploadingFor(null);
      return;
    }
    // Detect offline up front — without this, a Supabase upload from a
    // dropped network hits the catch block with a generic "fetch failed"
    // and the user got a misleading "bucket missing" hint. navigator.onLine
    // is a hint, not a guarantee, but it catches the common case
    // (aeroplane mode, lost wifi) cleanly.
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      toast.error("You're offline — reconnect, then try again.");
      setUploadingFor(null);
      return;
    }
    try {
      const photo = await uploadGamePhoto(gameId, file, {
        playerName: tag ?? undefined,
      });
      setPhotos((prev) => [photo, ...prev]);
      toast.success(tag ? `Photo tagged to ${tag}.` : "Photo uploaded.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Couldn't upload the photo.";
      const looksLikeMissingBucket = /bucket not found/i.test(msg);
      const looksLikeMissingColumn = /column .* does not exist/i.test(msg);
      const looksLikeNetwork = /fetch|network|failed to fetch/i.test(msg);
      toast.error(
        looksLikeMissingBucket
          ? "game-photos bucket missing — run the Phase E migration in Supabase."
          : looksLikeMissingColumn
            ? "player_name column missing — run the Phase E.2 migration in Supabase."
            : looksLikeNetwork
              ? "Network glitch — please try again."
              : msg,
      );
    } finally {
      setUploadingFor(null);
    }
  };

  const handleDelete = async (photo: GamePhoto) => {
    if (!confirm("Delete this photo?")) return;
    try {
      await deleteGamePhoto(photo.id, extractPath(photo.url));
      setPhotos((prev) => prev.filter((p) => p.id !== photo.id));
      setViewer(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't delete the photo.");
    }
  };

  if (!loading && photos.length === 0 && !canUpload) {
    // Nothing to show and nothing to do — render nothing rather than an
    // empty box. Anonymous visitors don't get the uploader.
  }

  return (
    <section className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-4 md:p-5 mb-4">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 rounded-lg bg-cyan-400/10 border border-cyan-400/30 shrink-0">
            <Camera size={14} className="text-cyan-400" />
          </div>
          <h2 className="text-sm md:text-base font-black tracking-widest uppercase">
            Photos
          </h2>
          {photos.length > 0 && (
            <span className="text-[10px] font-bold tracking-widest uppercase text-white/30 ml-1 tabular-nums">
              {photos.length}
            </span>
          )}
        </div>
      </div>

      {/* Per-player upload row — tap a player's avatar to attach a chip-
          stack photo for them specifically. Falls back to "Untagged" for
          food / scene shots. */}
      {canUpload && (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            capture="environment"
            onChange={handleFile}
            className="hidden"
          />
          <div className="flex items-center gap-2 flex-wrap mb-4">
            <span className="text-[10px] font-black tracking-widest uppercase text-white/40 mr-1">
              Attach to:
            </span>
            {players.map((p) => {
              const busy = uploadingFor === p.name;
              return (
                <button
                  key={p.name}
                  type="button"
                  onClick={() => openPicker(p.name)}
                  disabled={uploadingFor !== null}
                  title={`Attach a photo to ${p.name}`}
                  aria-label={`Attach a photo tagged to ${p.name}`}
                  className="group relative inline-flex items-center gap-1.5 pl-1 pr-2.5 py-1.5 min-h-9 rounded-full bg-black/30 hover:bg-cyan-400/15 border border-white/10 hover:border-cyan-400/40 text-white/70 hover:text-cyan-400 text-xs font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <PlayerAvatar
                    name={p.name}
                    avatarUrl={p.avatarUrl}
                    size={20}
                    className="rounded-full border border-white/10 shrink-0"
                  />
                  <span className="truncate max-w-[80px]">{p.name}</span>
                  {busy ? (
                    <Loader2 size={11} className="animate-spin" />
                  ) : (
                    <Camera size={11} className="opacity-60 group-hover:opacity-100 transition-opacity" />
                  )}
                </button>
              );
            })}
            {/* Untagged uploader — for food, table, banter shots that
                aren't tied to one player's stack. */}
            <button
              type="button"
              onClick={() => openPicker(null)}
              disabled={uploadingFor !== null}
              title="Attach a general photo (no player)"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-9 rounded-full bg-black/30 hover:bg-white/10 border border-white/10 hover:border-white/30 text-white/50 hover:text-white text-xs font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {uploadingFor === "__untagged__" ? (
                <Loader2 size={11} className="animate-spin" />
              ) : (
                <Camera size={11} />
              )}
              <span>General</span>
            </button>
          </div>
        </>
      )}

      {loading ? (
        <p className="text-xs text-white/30 italic">Loading photos…</p>
      ) : photos.length === 0 ? (
        <p className="text-xs text-white/30 italic">
          No photos yet — tap a player above to attach a chip-stack shot, or use General for the food spread.
        </p>
      ) : (
        // Two columns on phones so thumbnails are big enough to tap; up to
        // four on tablet/desktop. The previous 3/4/5 layout crushed
        // thumbnails on small screens.
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {photos.map((p) => {
            const taggedPlayer = p.playerName
              ? players.find((pl) => pl.name.toLowerCase() === p.playerName!.toLowerCase())
              : null;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setViewer(p)}
                className="group relative aspect-square overflow-hidden rounded-lg border border-white/10 hover:border-cyan-400/40 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.url}
                  alt={p.caption ?? (p.playerName ? `${p.playerName}'s stack` : `Game photo ${p.id}`)}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  loading="lazy"
                />
                {/* Tag overlay — avatar + name when the photo is tied to a
                    specific player, plain icon otherwise. */}
                {p.playerName ? (
                  <span className="absolute bottom-1 left-1 right-1 inline-flex items-center gap-1.5 pl-0.5 pr-1.5 py-0.5 rounded-full bg-black/70 backdrop-blur-sm text-white text-[10px] font-bold truncate">
                    <PlayerAvatar
                      name={p.playerName}
                      avatarUrl={taggedPlayer?.avatarUrl}
                      size={16}
                      className="rounded-full border border-white/20 shrink-0"
                    />
                    <span className="truncate">{p.playerName}</span>
                  </span>
                ) : (
                  <span className="absolute bottom-1 left-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-black/70 backdrop-blur-sm text-white/70 text-[9px] font-bold tracking-widest uppercase">
                    <Tag size={8} /> General
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {viewer && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Photo viewer"
          className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setViewer(null)}
        >
          <button
            type="button"
            onClick={() => setViewer(null)}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white inline-flex items-center justify-center"
            aria-label="Close"
          >
            <X size={20} />
          </button>
          <div onClick={(e) => e.stopPropagation()} className="relative max-w-3xl w-full max-h-[80vh]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={viewer.url}
              alt={viewer.caption ?? `Game photo ${viewer.id}`}
              className="w-full h-full object-contain"
            />
            {viewer.playerName && (
              <div className="absolute top-3 left-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/70 backdrop-blur-sm text-white text-sm font-bold">
                <PlayerAvatar
                  name={viewer.playerName}
                  avatarUrl={players.find((pl) => pl.name.toLowerCase() === viewer.playerName!.toLowerCase())?.avatarUrl}
                  size={24}
                  className="rounded-full border border-white/20 shrink-0"
                />
                {viewer.playerName}
              </div>
            )}
            {canUpload && (
              <button
                type="button"
                onClick={() => handleDelete(viewer)}
                className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-200 font-black uppercase text-xs tracking-widest transition-colors"
              >
                <Trash2 size={12} /> Delete
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

// Public URLs end with `/<bucket>/<path>` — recover the path for the
// delete call. We could pass the storage_path through directly, but
// fetchPhotosForGame currently returns only the URL; this keeps that API
// stable.
function extractPath(url: string): string {
  const marker = "/game-photos/";
  const i = url.indexOf(marker);
  return i >= 0 ? url.slice(i + marker.length) : url;
}
