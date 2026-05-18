"use client";

// Server-rendered list of attached photos for a game + a client-side
// uploader. Uploads happen straight from the user's device camera roll
// (or camera) via the file input's `capture` attribute hint on mobile.

import { useEffect, useRef, useState } from "react";
import { Camera, Loader2, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  deleteGamePhoto,
  fetchPhotosForGame,
  uploadGamePhoto,
  type GamePhoto,
} from "@/lib/game-photos";

type Props = {
  gameId: string;
  /** When true, render the upload affordance. */
  canUpload: boolean;
};

export default function GamePhotos({ gameId, canUpload }: Props) {
  const [photos, setPhotos] = useState<GamePhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [viewer, setViewer] = useState<GamePhoto | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setUploading(true);
    try {
      const photo = await uploadGamePhoto(gameId, file);
      setPhotos((prev) => [photo, ...prev]);
      toast.success("Photo uploaded.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Couldn't upload the photo.";
      const looksLikeMissingBucket = /bucket not found/i.test(msg);
      toast.error(
        looksLikeMissingBucket
          ? "game-photos bucket missing — run the Phase E migration in Supabase."
          : msg,
      );
    } finally {
      setUploading(false);
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
    // No photos and no upload affordance to surface — render nothing.
    return null;
  }

  return (
    <section className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-4 md:p-5 mb-4">
      <div className="flex items-center justify-between gap-3 mb-3">
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
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-cyan-400/15 hover:bg-cyan-400/25 border border-cyan-400/40 text-cyan-400 font-black uppercase text-xs tracking-widest transition-colors disabled:opacity-50"
            >
              {uploading ? <Loader2 size={12} className="animate-spin" /> : <Camera size={12} />}
              {uploading ? "Uploading" : "Add photo"}
            </button>
          </>
        )}
      </div>

      {loading ? (
        <p className="text-xs text-white/30 italic">Loading photos…</p>
      ) : photos.length === 0 ? (
        <p className="text-xs text-white/30 italic">
          No photos yet — chip-stack shots, food spreads, and post-game scoreboards welcome.
        </p>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
          {photos.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setViewer(p)}
              className="group relative aspect-square overflow-hidden rounded-lg border border-white/10 hover:border-cyan-400/40 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.url}
                alt={p.caption ?? `Game photo ${p.id}`}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                loading="lazy"
              />
            </button>
          ))}
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
