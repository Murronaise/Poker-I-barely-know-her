"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ChevronLeft, Calendar, Check, X, HelpCircle, Crown, Share2,
  CalendarPlus, RefreshCw, AlertTriangle, Trash2, Lock, Users,
} from "lucide-react";
import { use } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isAdmin } from "@/lib/auth";
import {
  Poll, PollOption, Rsvp, PollWithDetails, RsvpResponse, OptionTally,
  tallyPoll, suggestWinner,
} from "@/lib/polls";
import {
  buildIcsBody, downloadIcs, googleCalendarUrl, whatsappShareUrl,
} from "@/lib/calendar-share";

type UserMap = Record<string, { player_name: string }>;

export default function PollDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: pollId } = use(params);
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();

  const [poll, setPoll] = useState<PollWithDetails | null>(null);
  const [users, setUsers] = useState<UserMap>({});
  const [me, setMe] = useState<{ id: string; email?: string } | null>(null);
  const [iAmAdmin, setIAmAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const loadPoll = useCallback(async () => {
    const [{ data: pollData }, { data: optionsData }, { data: rsvpData }, { data: userData }] = await Promise.all([
      supabase.from("polls").select("*").eq("id", pollId).single(),
      supabase.from("poll_options").select("*").eq("poll_id", pollId).order("game_date"),
      supabase.from("rsvps").select("*").eq("poll_id", pollId),
      supabase.from("users").select("user_id, player_name"),
    ]);

    if (!pollData) {
      setPoll(null);
      setLoading(false);
      return;
    }

    setPoll({
      ...(pollData as Poll),
      options: (optionsData as PollOption[]) ?? [],
      rsvps: (rsvpData as Rsvp[]) ?? [],
    });

    const map: UserMap = {};
    (userData ?? []).forEach((u: { user_id: string; player_name: string }) => {
      map[u.user_id] = { player_name: u.player_name };
    });
    setUsers(map);
    setLoading(false);
  }, [supabase, pollId]);

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      const { data } = await supabase.auth.getUser();
      if (cancelled) return;
      const u = data.user ? { id: data.user.id, email: data.user.email } : null;
      setMe(u);

      // Resolve admin status (email allow-list first, then DB).
      if (u?.email) {
        if (isAdmin(u.email)) {
          setIAmAdmin(true);
        } else {
          const { data: profile } = await supabase
            .from("users")
            .select("is_admin")
            .eq("email", u.email)
            .maybeSingle();
          if (!cancelled) setIAmAdmin(profile?.is_admin === true);
        }
      }

      await loadPoll();
    };
    init();
    return () => { cancelled = true; };
  }, [supabase, loadPoll]);

  const myRsvps: Record<string, RsvpResponse> = useMemo(() => {
    if (!poll || !me) return {};
    const out: Record<string, RsvpResponse> = {};
    for (const r of poll.rsvps) {
      if (r.user_id === me.id) out[r.poll_option_id] = r.response;
    }
    return out;
  }, [poll, me]);

  const tallies = useMemo<Map<string, OptionTally>>(
    () => poll ? tallyPoll(poll) : new Map(),
    [poll],
  );

  const confirmedOption = useMemo(() => {
    if (!poll || !poll.confirmed_option_id) return null;
    return poll.options.find((o) => o.id === poll.confirmed_option_id) ?? null;
  }, [poll]);

  const winnerOption = useMemo(() => poll ? suggestWinner(poll) : null, [poll]);

  // ---- Voting --------------------------------------------------------------

  const setVote = async (optionId: string, response: RsvpResponse) => {
    if (!me || !poll) return;
    setError("");
    setBusy(true);

    const existing = poll.rsvps.find((r) => r.user_id === me.id && r.poll_option_id === optionId);

    try {
      if (existing && existing.response === response) {
        // Toggle off — clear the vote.
        const { error: delErr } = await supabase.from("rsvps").delete().eq("id", existing.id);
        if (delErr) throw delErr;
      } else if (existing) {
        const { error: updErr } = await supabase
          .from("rsvps")
          .update({ response })
          .eq("id", existing.id);
        if (updErr) throw updErr;
      } else {
        const { error: insErr } = await supabase.from("rsvps").insert({
          poll_id: poll.id,
          poll_option_id: optionId,
          user_id: me.id,
          response,
        });
        if (insErr) throw insErr;
      }
      await loadPoll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record vote.");
    } finally {
      setBusy(false);
    }
  };

  // ---- Admin actions -------------------------------------------------------

  const confirmOption = async (optionId: string) => {
    if (!poll) return;
    setBusy(true);
    setError("");
    try {
      const { error: e } = await supabase
        .from("polls")
        .update({ confirmed_option_id: optionId, status: "confirmed" })
        .eq("id", poll.id);
      if (e) throw e;
      await loadPoll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to confirm.");
    } finally {
      setBusy(false);
    }
  };

  const reopenPoll = async () => {
    if (!poll) return;
    setBusy(true);
    setError("");
    try {
      const { error: e } = await supabase
        .from("polls")
        .update({ confirmed_option_id: null, status: "open" })
        .eq("id", poll.id);
      if (e) throw e;
      await loadPoll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reopen.");
    } finally {
      setBusy(false);
    }
  };

  const triggerRepoll = async () => {
    if (!poll) return;
    if (!confirm("This will mark the current poll superseded and take you to a new poll for the same weekend. Continue?")) return;
    setBusy(true);
    try {
      await supabase.from("polls").update({ status: "superseded" }).eq("id", poll.id);
      router.push(`/games/poll/new?weekend=${poll.weekend_start_date}&parent=${poll.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to repoll.");
      setBusy(false);
    }
  };

  const deletePoll = async () => {
    if (!poll) return;
    if (!confirm("Delete this poll permanently? RSVPs will be lost.")) return;
    setBusy(true);
    try {
      await supabase.from("polls").delete().eq("id", poll.id);
      router.push("/games/poll");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete.");
      setBusy(false);
    }
  };

  // ---- Share + calendar ---------------------------------------------------

  const calendarEventForOption = (opt: PollOption) => ({
    title: "Poker Night",
    description: poll?.notes || "Confirmed via Poker Tracker",
    date: opt.game_date,
    startTime: opt.start_time.slice(0, 5),
    durationMinutes: 240,
  });

  const buildShareMessage = (): string => {
    if (!poll) return "";
    const url = typeof window !== "undefined"
      ? `${window.location.origin}/games/poll/${poll.id}`
      : "";

    if (confirmedOption) {
      const dateStr = new Date(confirmedOption.game_date + "T00:00:00").toLocaleDateString("en-GB", {
        weekday: "long", day: "numeric", month: "long",
      });
      return [
        `🎲 Poker night confirmed: ${dateStr} at ${confirmedOption.start_time.slice(0, 5)}`,
        poll.notes ? poll.notes : null,
        "",
        `Confirm or check details: ${url}`,
      ].filter(Boolean).join("\n");
    }

    const days = poll.options.map((o) =>
      new Date(o.game_date + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short" }),
    ).join(" / ");

    const winner = winnerOption ? tallies.get(winnerOption.id) : null;

    return [
      `🃏 Poker poll for next weekend (${days})`,
      winner ? `Leader: ${formatDateShort(winnerOption!.game_date)} (${winner.yes} yes${winner.maybe ? `, ${winner.maybe} maybe` : ""})` : null,
      "",
      `Vote here: ${url}`,
    ].filter(Boolean).join("\n");
  };

  // ---- Render --------------------------------------------------------------

  if (loading) {
    return (
      <main className="flex-1 flex items-center justify-center text-white/40 text-sm tracking-widest uppercase">
        Loading…
      </main>
    );
  }

  if (!poll) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center px-4 text-center">
        <div className="bg-white/5 border border-white/10 rounded-2xl p-8 max-w-sm">
          <AlertTriangle className="text-yellow-400 mx-auto mb-3" size={28} />
          <h2 className="text-xl font-black uppercase mb-2">Poll not found</h2>
          <p className="text-white/50 mb-4">It may have been deleted.</p>
          <Link
            href="/games/poll"
            className="inline-block bg-[#39FF14]/20 hover:bg-[#39FF14]/30 border border-[#39FF14]/50 text-[#39FF14] font-black uppercase text-sm px-4 py-2 rounded-lg transition-colors"
          >
            All Polls
          </Link>
        </div>
      </main>
    );
  }

  const totalUniqueVoters = new Set(poll.rsvps.map((r) => r.user_id)).size;
  const yesForConfirmed = confirmedOption
    ? (tallies.get(confirmedOption.id)?.yes ?? 0)
    : 0;
  const isUnderMinimum = confirmedOption !== null && yesForConfirmed < poll.min_players;

  return (
    <motion.main
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex-1 md:overflow-auto bg-[radial-gradient(circle_at_top,_rgba(57,255,20,0.05)_0%,_rgba(14,17,23,1)_60%)] text-[#FAFAFA] px-4 md:px-6 xl:px-12 py-5"
    >
      <Link
        href="/games/poll"
        className="inline-flex items-center gap-2 text-base text-white/50 hover:text-[#39FF14] font-semibold transition-colors mb-6"
      >
        <ChevronLeft size={18} />
        <span>All Polls</span>
      </Link>

      <div className="max-w-3xl">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-[#39FF14]/10 rounded-xl border border-[#39FF14]/20">
              <Calendar className="text-[#39FF14]" size={22} />
            </div>
            <div>
              <h1 className="text-2xl md:text-4xl font-black tracking-tight uppercase leading-none">
                Weekend of {formatDateLong(poll.weekend_start_date)}
              </h1>
              <p className="text-white/50 text-base mt-2">
                {poll.status === "open" && "Vote on the days that work for you"}
                {poll.status === "confirmed" && confirmedOption && `Confirmed: ${formatDateLong(confirmedOption.game_date)}`}
                {poll.status === "cancelled" && "This poll was cancelled"}
                {poll.status === "superseded" && "This poll was replaced by a re-poll"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <a
              href={whatsappShareUrl(buildShareMessage())}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-[#25D366]/10 hover:bg-[#25D366]/20 border border-[#25D366]/40 text-[#25D366] font-bold uppercase text-xs tracking-widest transition-colors"
            >
              <Share2 size={14} />
              WhatsApp
            </a>
          </div>
        </div>

        {/* Login prompt for anon users */}
        {!me && (
          <div className="bg-yellow-400/10 border border-yellow-400/30 rounded-2xl p-5 mb-6 flex items-center gap-3">
            <Lock size={18} className="text-yellow-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-yellow-400">Log in to vote</p>
            </div>
            <Link
              href="/login"
              className="bg-yellow-400/20 hover:bg-yellow-400/30 border border-yellow-400/50 text-yellow-400 font-black uppercase text-xs px-3 py-2 rounded-lg transition-colors"
            >
              Login
            </Link>
          </div>
        )}

        {/* Confirmed banner (with calendar buttons) */}
        {confirmedOption && (
          <div className={`rounded-2xl p-5 md:p-6 mb-6 border ${
            isUnderMinimum
              ? "bg-red-500/10 border-red-500/40"
              : "bg-[#39FF14]/10 border-[#39FF14]/40"
          }`}>
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  {isUnderMinimum ? (
                    <AlertTriangle className="text-red-400" size={18} />
                  ) : (
                    <Crown className="text-yellow-400" size={18} />
                  )}
                  <span className={`text-xs font-black tracking-widest uppercase ${
                    isUnderMinimum ? "text-red-400" : "text-[#39FF14]"
                  }`}>
                    {isUnderMinimum ? "Below Minimum" : "Confirmed"}
                  </span>
                </div>
                <p className="text-2xl md:text-3xl font-black tracking-tight uppercase">
                  {formatDateLong(confirmedOption.game_date)}
                </p>
                <p className="text-white/60 text-sm mt-1">
                  {confirmedOption.start_time.slice(0, 5)} · {yesForConfirmed} yes / {tallies.get(confirmedOption.id)?.maybe ?? 0} maybe
                </p>
                {isUnderMinimum && (
                  <p className="text-red-400 text-sm mt-2 font-semibold">
                    Only {yesForConfirmed} yeses (min {poll.min_players}). Time to re-poll.
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <a
                  href={googleCalendarUrl(calendarEventForOption(confirmedOption))}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 hover:border-[#39FF14]/40 text-white/70 hover:text-[#39FF14] font-bold uppercase text-xs tracking-widest transition-colors"
                >
                  <CalendarPlus size={14} />
                  Google
                </a>
                <button
                  onClick={() => downloadIcs(calendarEventForOption(confirmedOption), `poker-${confirmedOption.game_date}.ics`)}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 hover:border-[#39FF14]/40 text-white/70 hover:text-[#39FF14] font-bold uppercase text-xs tracking-widest transition-colors"
                >
                  <CalendarPlus size={14} />
                  .ics
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Notes */}
        {poll.notes && (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 mb-6">
            <p className="text-xs font-bold text-white/50 uppercase tracking-widest mb-1">Notes</p>
            <p className="text-base text-white/80 whitespace-pre-line">{poll.notes}</p>
          </div>
        )}

        {/* Options + voting */}
        <div className="space-y-3">
          {poll.options.map((opt) => {
            const tally = tallies.get(opt.id);
            const isWinner = winnerOption?.id === opt.id;
            const isConfirmed = confirmedOption?.id === opt.id;
            const myVote = myRsvps[opt.id];

            return (
              <div
                key={opt.id}
                className={`bg-white/5 backdrop-blur-xl border rounded-2xl p-4 md:p-5 transition-colors ${
                  isConfirmed
                    ? "border-[#39FF14]/50 bg-[#39FF14]/5"
                    : isWinner && poll.status === "open"
                      ? "border-yellow-400/40"
                      : "border-white/10"
                }`}
              >
                <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-lg md:text-xl font-black uppercase tracking-tight">
                        {opt.label}
                      </p>
                      {opt.is_bank_holiday && (
                        <span className="text-[10px] font-bold text-yellow-400 uppercase tracking-widest bg-yellow-400/10 border border-yellow-400/30 rounded px-1.5 py-0.5">
                          Bank holiday
                        </span>
                      )}
                      {isConfirmed && (
                        <span className="text-[10px] font-bold text-[#39FF14] uppercase tracking-widest bg-[#39FF14]/10 border border-[#39FF14]/30 rounded px-1.5 py-0.5">
                          Confirmed
                        </span>
                      )}
                      {!isConfirmed && isWinner && poll.status === "open" && (
                        <span className="text-[10px] font-bold text-yellow-400 uppercase tracking-widest bg-yellow-400/10 border border-yellow-400/30 rounded px-1.5 py-0.5">
                          Leader
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-white/50 mt-1">
                      {formatDateLong(opt.game_date)} · {opt.start_time.slice(0, 5)}
                    </p>
                  </div>

                  {iAmAdmin && poll.status === "open" && (
                    <button
                      onClick={() => confirmOption(opt.id)}
                      disabled={busy}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-[#39FF14]/10 hover:bg-[#39FF14]/20 border border-[#39FF14]/40 text-[#39FF14] font-bold uppercase text-xs tracking-widest transition-colors disabled:opacity-50"
                    >
                      <Crown size={12} />
                      Confirm
                    </button>
                  )}
                </div>

                {/* Tally bars */}
                {tally && (
                  <div className="flex items-center gap-3 mb-3 text-xs font-bold tracking-widest uppercase">
                    <span className="text-[#39FF14]">{tally.yes} yes</span>
                    <span className="text-yellow-400/80">{tally.maybe} maybe</span>
                    <span className="text-red-400/80">{tally.no} no</span>
                  </div>
                )}

                {/* Voter chips */}
                {tally && tally.voters.yes.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {tally.voters.yes.map((uid) => (
                      <span key={uid} className="text-xs font-semibold text-[#39FF14] bg-[#39FF14]/10 border border-[#39FF14]/20 rounded-full px-2 py-0.5">
                        {users[uid]?.player_name ?? "Player"}
                      </span>
                    ))}
                  </div>
                )}

                {/* Vote buttons */}
                {me && poll.status === "open" && (
                  <div className="grid grid-cols-3 gap-2">
                    <VoteButton
                      label="Yes"
                      icon={<Check size={14} />}
                      active={myVote === "yes"}
                      colorClass="text-[#39FF14] border-[#39FF14]/40"
                      activeBg="bg-[#39FF14]/20"
                      onClick={() => setVote(opt.id, "yes")}
                      disabled={busy}
                    />
                    <VoteButton
                      label="Maybe"
                      icon={<HelpCircle size={14} />}
                      active={myVote === "maybe"}
                      colorClass="text-yellow-400 border-yellow-400/40"
                      activeBg="bg-yellow-400/20"
                      onClick={() => setVote(opt.id, "maybe")}
                      disabled={busy}
                    />
                    <VoteButton
                      label="No"
                      icon={<X size={14} />}
                      active={myVote === "no"}
                      colorClass="text-red-400 border-red-400/40"
                      activeBg="bg-red-400/20"
                      onClick={() => setVote(opt.id, "no")}
                      disabled={busy}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer stats */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4 mt-6 flex items-center gap-3">
          <Users size={16} className="text-white/40" />
          <p className="text-sm text-white/60">
            {totalUniqueVoters} {totalUniqueVoters === 1 ? "person has" : "people have"} voted
          </p>
        </div>

        {/* Admin actions */}
        {iAmAdmin && (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-5 mt-6">
            <h3 className="text-xs font-black tracking-widest uppercase text-white/40 mb-3">Admin</h3>
            <div className="flex flex-wrap gap-2">
              {poll.status === "confirmed" && (
                <button
                  onClick={reopenPoll}
                  disabled={busy}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 font-bold uppercase text-xs tracking-widest transition-colors disabled:opacity-50"
                >
                  Reopen
                </button>
              )}
              {(poll.status === "open" || poll.status === "confirmed") && (
                <button
                  onClick={triggerRepoll}
                  disabled={busy}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-yellow-400/10 hover:bg-yellow-400/20 border border-yellow-400/40 text-yellow-400 font-bold uppercase text-xs tracking-widest transition-colors disabled:opacity-50"
                >
                  <RefreshCw size={12} />
                  Force Re-poll
                </button>
              )}
              <button
                onClick={deletePoll}
                disabled={busy}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/40 text-red-400 font-bold uppercase text-xs tracking-widest transition-colors disabled:opacity-50 ml-auto"
              >
                <Trash2 size={12} />
                Delete
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-400/10 border border-red-400/30 rounded-lg px-4 py-3 mt-4">
            <p className="text-sm font-semibold text-red-400">{error}</p>
          </div>
        )}
      </div>
    </motion.main>
  );
}

function VoteButton({
  label, icon, active, colorClass, activeBg, onClick, disabled,
}: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  colorClass: string;
  activeBg: string;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border font-bold uppercase text-xs tracking-widest transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-11 ${colorClass} ${
        active ? activeBg : "bg-black/20 hover:bg-white/5"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function formatDateLong(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

function formatDateShort(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", {
    weekday: "short", day: "numeric", month: "short",
  });
}
