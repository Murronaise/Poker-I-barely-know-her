"use client";

// Admin-only inline notes panel for a single historical game. Rendered on
// the history page above the Results section. Non-admins never see this —
// the parent gates render via `isAdmin`, and RLS independently rejects the
// read for non-admin sessions so a bypassed UI gate still returns nothing.
//
// The panel is collapsed by default with a one-line preview; click → expand
// → edit. Saves run on blur (debounce) so the admin doesn't have to hunt
// for a "Save" button while scribbling context.

import { useEffect, useState } from "react";
import { NotebookPen, Save, Lock, Loader2, Check, X, Edit2, Plus, ChevronUp } from "lucide-react";
import { saveGameNote, type GameNote } from "@/lib/game-notes-db";

type Props = {
  gameId: string;
  initialNote: GameNote | null;
};

const MAX_LENGTH = 4000;

export default function AdminGameNotes({ gameId, initialNote }: Props) {
  const [note, setNote] = useState(initialNote?.note ?? "");
  // Track the last saved value so we can show a "dirty" indicator when the
  // textarea diverges. Kept in state (not a ref) so the dirty flag stays
  // in sync with React's render cycle without reading refs during render.
  const [lastSaved, setLastSaved] = useState(initialNote?.note ?? "");
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const dirty = note.trim() !== lastSaved.trim();

  // Reset the "saved" pulse after a couple of seconds so the green tick
  // doesn't sit there permanently.
  useEffect(() => {
    if (status !== "saved") return;
    const t = window.setTimeout(() => setStatus("idle"), 1800);
    return () => window.clearTimeout(t);
  }, [status]);

  const persist = async () => {
    if (!dirty) return;
    setStatus("saving");
    setError(null);
    try {
      await saveGameNote(gameId, note);
      setLastSaved(note.trim());
      setStatus("saved");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Couldn't save the note.";
      const looksLikeMissingTable = /relation .* does not exist/i.test(msg);
      setError(
        looksLikeMissingTable
          ? "game_notes table missing — run the Phase A migration in Supabase."
          : msg,
      );
      setStatus("error");
    }
  };

  return (
    <section className="bg-white/5 backdrop-blur-xl border border-cyan-400/20 rounded-2xl p-4 mb-4 shrink-0">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 rounded-lg bg-cyan-400/10 border border-cyan-400/30 shrink-0">
            <NotebookPen size={14} className="text-cyan-400" />
          </div>
          <h2 className="text-sm md:text-base font-black tracking-widest uppercase text-cyan-400">
            Admin Notes
          </h2>
          <span className="inline-flex items-center gap-1 text-[10px] font-bold tracking-widest uppercase text-cyan-400/70 bg-cyan-400/10 border border-cyan-400/20 rounded px-1.5 py-0.5">
            <Lock size={9} />
            Private
          </span>
        </div>
        {/* Style matches the Edit / Delete buttons in HistoryActions so the
            admin controls feel like one set rather than three different
            looks. */}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-cyan-400/10 border border-white/10 hover:border-cyan-400/40 text-white/50 hover:text-cyan-400 font-bold text-xs uppercase tracking-widest transition-colors"
        >
          {open ? (
            <>
              <ChevronUp size={11} /> Collapse
            </>
          ) : note.trim() ? (
            <>
              <Edit2 size={11} /> Edit
            </>
          ) : (
            <>
              <Plus size={11} /> Add notes
            </>
          )}
        </button>
      </div>

      {!open ? (
        // Collapsed: show a single-line preview so the admin can glance at the
        // existing context without expanding. Empty state nudges them to add
        // notes the first time.
        note.trim() ? (
          <p className="text-sm text-white/70 line-clamp-2 cursor-text" onClick={() => setOpen(true)}>
            {note.trim()}
          </p>
        ) : (
          <p className="text-xs text-white/30 italic">
            No notes yet. Click <span className="font-bold">Add notes</span> to record context, disputes, or anything worth remembering.
          </p>
        )
      ) : (
        <div className="flex flex-col gap-2">
          <textarea
            value={note}
            onChange={(e) => {
              if (e.target.value.length <= MAX_LENGTH) setNote(e.target.value);
            }}
            onBlur={persist}
            placeholder="Private context for this session — who arrived late, what the table dynamic was, why a settlement got disputed…"
            rows={5}
            className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/40 transition-colors resize-y min-h-[120px]"
          />
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <span className="text-[10px] font-bold tracking-widest uppercase text-white/30 tabular-nums">
              {note.length}/{MAX_LENGTH}
            </span>
            <div className="flex items-center gap-2">
              {status === "saving" && (
                <span className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest uppercase text-white/60">
                  <Loader2 size={11} className="animate-spin" /> Saving
                </span>
              )}
              {status === "saved" && (
                <span className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest uppercase text-[#39FF14]">
                  <Check size={11} /> Saved
                </span>
              )}
              {status === "error" && error && (
                <span className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest uppercase text-red-400 max-w-[280px] truncate" title={error}>
                  <X size={11} /> {error}
                </span>
              )}
              <button
                type="button"
                onClick={persist}
                disabled={!dirty || status === "saving"}
                className="inline-flex items-center gap-1.5 text-[10px] font-black tracking-widest uppercase text-cyan-400 bg-cyan-400/10 border border-cyan-400/40 hover:bg-cyan-400/20 disabled:opacity-40 disabled:cursor-not-allowed rounded-md px-2.5 py-1 transition-colors"
              >
                <Save size={11} />
                {dirty ? "Save now" : "Saved"}
              </button>
            </div>
          </div>
          {initialNote?.updatedAt && (
            <p className="text-[10px] text-white/30 tabular-nums">
              Last updated {new Date(initialNote.updatedAt).toLocaleString()}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
