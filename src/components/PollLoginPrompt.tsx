"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Calendar, Check, X, HelpCircle, ArrowRight } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  Poll, PollOption, Rsvp, PollWithDetails, RsvpResponse,
  tallyPoll,
} from "@/lib/polls";

// One-time post-login modal: if the user lands on the app right after a
// fresh login AND there's an open poll they haven't responded to, show a
// modal nudging them to RSVP. The dashboard banner still does the same job
// passively, but this guarantees they at least see it once.
//
// Trigger: a "fresh login" flag set in sessionStorage by the login page.
// The flag is consumed (deleted) immediately so the modal only ever fires
// once per login.

const FRESH_LOGIN_KEY = "pt:freshLogin";
const SNOOZE_KEY = "pt:pollPromptSnoozedFor"; // poll id we last dismissed

/** Called from the login page on successful auth. */
export function markFreshLogin() {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(FRESH_LOGIN_KEY, "1");
  } catch {
    // ignore quota / private mode failures
  }
}

export default function PollLoginPrompt() {
  const supabase = createSupabaseBrowserClient();
  const [poll, setPoll] = useState<PollWithDetails | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [voted, setVoted] = useState<Record<string, RsvpResponse>>({});

  const findRelevantPoll = useCallback(async (userId: string) => {
    // Only consider open polls for upcoming (or very recent) weekends.
    const weekFloor = new Date();
    weekFloor.setDate(weekFloor.getDate() - 7);
    const floorIso = toIsoDate(weekFloor);

    const { data: openPolls } = await supabase
      .from("polls")
      .select("*")
      .eq("status", "open")
      .gte("weekend_start_date", floorIso)
      .order("weekend_start_date", { ascending: true });

    if (!openPolls?.length) return null;

    // Find the soonest poll where the user hasn't responded at all.
    for (const p of openPolls as Poll[]) {
      const { data: existingVotes } = await supabase
        .from("rsvps")
        .select("id")
        .eq("poll_id", p.id)
        .eq("user_id", userId)
        .limit(1);
      if (existingVotes && existingVotes.length > 0) continue;

      // Skip if the user already snoozed this exact poll.
      if (typeof window !== "undefined" && sessionStorage.getItem(SNOOZE_KEY) === p.id) {
        continue;
      }

      const [{ data: opts }, { data: rsvps }] = await Promise.all([
        supabase.from("poll_options").select("*").eq("poll_id", p.id).order("game_date"),
        supabase.from("rsvps").select("*").eq("poll_id", p.id),
      ]);

      return {
        ...p,
        options: (opts as PollOption[]) ?? [],
        rsvps: (rsvps as Rsvp[]) ?? [],
      };
    }
    return null;
  }, [supabase]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Bail unless this navigation was triggered by a fresh login.
    const fresh = sessionStorage.getItem(FRESH_LOGIN_KEY);
    if (!fresh) return;
    sessionStorage.removeItem(FRESH_LOGIN_KEY);

    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user || cancelled) return;
      const found = await findRelevantPoll(data.user.id);
      if (cancelled) return;
      if (found) {
        setPoll(found);
        setOpen(true);
      }
    })();

    return () => { cancelled = true; };
  }, [supabase, findRelevantPoll]);

  const dismiss = () => {
    if (poll && typeof window !== "undefined") {
      try { sessionStorage.setItem(SNOOZE_KEY, poll.id); } catch { /* ignore */ }
    }
    setOpen(false);
  };

  const setVote = async (optionId: string, response: RsvpResponse) => {
    if (!poll || busy) return;
    setBusy(true);
    try {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return;

      // Toggle off if clicking the same response again.
      const current = voted[optionId];
      if (current === response) {
        await supabase
          .from("rsvps")
          .delete()
          .eq("poll_id", poll.id)
          .eq("poll_option_id", optionId)
          .eq("user_id", data.user.id);
        setVoted((v) => {
          const next = { ...v };
          delete next[optionId];
          return next;
        });
      } else {
        // Upsert: try update, fall back to insert. Simpler than a real
        // upsert because rsvps has a UNIQUE(poll_option_id, user_id) — we
        // just delete-then-insert.
        await supabase
          .from("rsvps")
          .delete()
          .eq("poll_id", poll.id)
          .eq("poll_option_id", optionId)
          .eq("user_id", data.user.id);
        await supabase.from("rsvps").insert({
          poll_id: poll.id,
          poll_option_id: optionId,
          user_id: data.user.id,
          response,
        });
        setVoted((v) => ({ ...v, [optionId]: response }));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <AnimatePresence>
      {open && poll && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[110] bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center p-4"
          onClick={dismiss}
        >
          <motion.div
            initial={{ y: 30, opacity: 0, scale: 0.96 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 20, opacity: 0 }}
            transition={{ type: "spring", damping: 24, stiffness: 280 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-[#0E1117] border border-[#39FF14]/30 rounded-2xl w-full max-w-md p-6 relative max-h-[90vh] overflow-y-auto shadow-[0_0_60px_rgba(57,255,20,0.15)]"
          >
            <button
              onClick={dismiss}
              aria-label="Close"
              className="absolute top-3 right-3 inline-flex items-center justify-center w-9 h-9 text-white/50 hover:text-white rounded-md hover:bg-white/5 transition-colors"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-3 mb-4 pr-10">
              <div className="p-2 bg-[#39FF14]/10 rounded-lg border border-[#39FF14]/20">
                <Calendar className="text-[#39FF14]" size={20} />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-black tracking-widest uppercase text-[#39FF14]">
                  Quick RSVP
                </p>
                <h2 className="text-xl font-black tracking-tight uppercase truncate">
                  Weekend of {formatDateLong(poll.weekend_start_date)}
                </h2>
              </div>
            </div>

            <p className="text-sm text-white/60 mb-5">
              You haven&apos;t voted yet — pick a response per day. You can change it later.
            </p>

            <div className="space-y-3">
              {poll.options.map((opt) => {
                const tally = tallyPoll(poll).get(opt.id);
                const myVote = voted[opt.id];
                return (
                  <div key={opt.id} className="bg-black/40 border border-white/10 rounded-lg p-3">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-white truncate">
                          {opt.label}
                        </p>
                        <p className="text-xs text-white/40">
                          {formatDateLong(opt.game_date)} · {opt.start_time.slice(0, 5)}
                        </p>
                      </div>
                      {tally && (
                        <p className="text-[10px] font-bold tracking-widest uppercase text-white/40 shrink-0">
                          {tally.yes}Y · {tally.maybe}M · {tally.no}N
                        </p>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <QuickVote label="Yes" icon={<Check size={13} />} active={myVote === "yes"}
                        color="text-[#39FF14] border-[#39FF14]/40" activeBg="bg-[#39FF14]/20"
                        onClick={() => setVote(opt.id, "yes")} disabled={busy} />
                      <QuickVote label="Maybe" icon={<HelpCircle size={13} />} active={myVote === "maybe"}
                        color="text-yellow-400 border-yellow-400/40" activeBg="bg-yellow-400/20"
                        onClick={() => setVote(opt.id, "maybe")} disabled={busy} />
                      <QuickVote label="No" icon={<X size={13} />} active={myVote === "no"}
                        color="text-red-400 border-red-400/40" activeBg="bg-red-400/20"
                        onClick={() => setVote(opt.id, "no")} disabled={busy} />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center gap-2 mt-5">
              <button
                onClick={dismiss}
                className="flex-1 px-4 py-2.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white/60 hover:text-white font-bold uppercase text-xs tracking-widest transition-colors"
              >
                Maybe later
              </button>
              <Link
                href={`/games/poll/${poll.id}`}
                onClick={() => setOpen(false)}
                className="flex-1 inline-flex items-center justify-center gap-1 px-4 py-2.5 rounded-lg bg-[#39FF14]/20 hover:bg-[#39FF14]/30 border border-[#39FF14]/50 text-[#39FF14] font-black uppercase text-xs tracking-widest transition-colors"
              >
                Open Poll
                <ArrowRight size={12} />
              </Link>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function QuickVote({
  label, icon, active, color, activeBg, onClick, disabled,
}: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  color: string;
  activeBg: string;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-1 px-2 py-2 rounded-md border font-bold uppercase text-[10px] tracking-widest transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-9 ${color} ${
        active ? activeBg : "bg-black/30 hover:bg-white/5"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function formatDateLong(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long",
  });
}

function toIsoDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
