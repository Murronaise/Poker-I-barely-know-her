"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ChevronLeft, Calendar, Plus, Lock, Crown, Users, AlertTriangle,
} from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isAdmin } from "@/lib/auth";
import { Poll, PollOption, Rsvp, tallyPoll } from "@/lib/polls";

type PollWithCounts = Poll & {
  options: PollOption[];
  rsvps: Rsvp[];
};

export default function PollsListPage() {
  const supabase = createSupabaseBrowserClient();

  const [polls, setPolls] = useState<PollWithCounts[]>([]);
  const [loading, setLoading] = useState(true);
  const [iAmAdmin, setIAmAdmin] = useState(false);
  const [me, setMe] = useState<{ id: string } | null>(null);

  const load = useCallback(async () => {
    const [{ data: pollsData }, { data: optionsData }, { data: rsvpsData }] = await Promise.all([
      supabase.from("polls").select("*").order("weekend_start_date", { ascending: false }),
      supabase.from("poll_options").select("*"),
      supabase.from("rsvps").select("*"),
    ]);

    const optionsByPoll: Record<string, PollOption[]> = {};
    (optionsData ?? []).forEach((o: PollOption) => {
      (optionsByPoll[o.poll_id] ||= []).push(o);
    });

    const rsvpsByPoll: Record<string, Rsvp[]> = {};
    (rsvpsData ?? []).forEach((r: Rsvp) => {
      (rsvpsByPoll[r.poll_id] ||= []).push(r);
    });

    const merged: PollWithCounts[] = (pollsData ?? []).map((p: Poll) => ({
      ...p,
      options: optionsByPoll[p.id] ?? [],
      rsvps: rsvpsByPoll[p.id] ?? [],
    }));
    setPolls(merged);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      const { data } = await supabase.auth.getUser();
      if (cancelled) return;
      setMe(data.user ? { id: data.user.id } : null);

      if (data.user?.email) {
        if (isAdmin(data.user.email)) {
          setIAmAdmin(true);
        } else {
          const { data: profile } = await supabase
            .from("users")
            .select("is_admin")
            .eq("email", data.user.email)
            .maybeSingle();
          if (!cancelled) setIAmAdmin(profile?.is_admin === true);
        }
      }

      await load();
    };
    init();

    // Mobile cold-start fix: on first navigation from another route the
    // browser sometimes runs the initial poll query before the Supabase
    // session cookie has finished rehydrating, so RLS returns zero rows and
    // the page reads as empty until the user pulls-to-refresh. Re-running
    // load() on the next auth state change picks up the now-authenticated
    // session and shows the existing poll without needing a manual refresh.
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (cancelled) return;
        setMe(session?.user ? { id: session.user.id } : null);
        load();
      },
    );

    return () => {
      cancelled = true;
      authListener?.subscription.unsubscribe();
    };
  }, [supabase, load]);

  return (
    <motion.main
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex-1 md:overflow-auto bg-[radial-gradient(circle_at_top,_rgba(57,255,20,0.05)_0%,_rgba(14,17,23,1)_60%)] text-[#FAFAFA] px-4 md:px-6 xl:px-12 py-5"
    >
      <Link
        href="/games"
        className="inline-flex items-center gap-2 text-base text-white/50 hover:text-[#39FF14] font-semibold transition-colors mb-6"
      >
        <ChevronLeft size={18} />
        <span>Back to Games</span>
      </Link>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-[#39FF14]/10 rounded-xl border border-[#39FF14]/20">
            <Calendar className="text-[#39FF14]" size={22} />
          </div>
          <div>
            <h1 className="text-2xl md:text-4xl font-black tracking-tight uppercase leading-none">
              Game Polls
            </h1>
            <p className="text-white/50 text-base mt-2">
              RSVP for upcoming weekends
            </p>
          </div>
        </div>

        {iAmAdmin ? (
          <Link
            href="/games/poll/new"
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#39FF14]/20 hover:bg-[#39FF14]/30 border border-[#39FF14]/50 text-[#39FF14] font-black uppercase text-sm tracking-widest transition-colors"
          >
            <Plus size={16} />
            New Poll
          </Link>
        ) : (
          <div
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white/40 font-black uppercase text-sm tracking-widest cursor-not-allowed"
            title="Admin access required"
          >
            <Lock size={16} />
            New Poll
          </div>
        )}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="bg-white/5 border border-white/10 rounded-2xl h-28 animate-pulse" />
          ))}
        </div>
      ) : polls.length === 0 ? (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-12 text-center">
          <Calendar className="text-white/20 mx-auto mb-3" size={32} />
          <p className="text-white/50 text-base mb-2">No polls yet</p>
          {iAmAdmin && (
            <p className="text-white/30 text-sm">Click &ldquo;New Poll&rdquo; to start one for an upcoming weekend.</p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {polls.map((poll) => (
            <PollCard key={poll.id} poll={poll} myUserId={me?.id} />
          ))}
        </div>
      )}
    </motion.main>
  );
}

function PollCard({ poll, myUserId }: { poll: PollWithCounts; myUserId?: string }) {
  const tallies = tallyPoll(poll);
  const totalYes = poll.options.reduce((sum, o) => sum + (tallies.get(o.id)?.yes ?? 0), 0);
  const uniqueVoters = new Set(poll.rsvps.map((r) => r.user_id)).size;
  const haveIVoted = myUserId ? poll.rsvps.some((r) => r.user_id === myUserId) : false;
  const confirmedOption = poll.confirmed_option_id
    ? poll.options.find((o) => o.id === poll.confirmed_option_id)
    : null;

  const statusBadge = (() => {
    switch (poll.status) {
      case "open":
        return { label: "Open", color: "text-cyan-400", bg: "bg-cyan-400/10 border-cyan-400/30" };
      case "confirmed":
        return { label: "Confirmed", color: "text-[#39FF14]", bg: "bg-[#39FF14]/10 border-[#39FF14]/30" };
      case "cancelled":
        return { label: "Cancelled", color: "text-red-400", bg: "bg-red-400/10 border-red-400/30" };
      case "superseded":
        return { label: "Re-polled", color: "text-white/40", bg: "bg-white/5 border-white/10" };
    }
  })();

  return (
    <Link
      href={`/games/poll/${poll.id}`}
      className="block bg-white/5 backdrop-blur-xl border border-white/10 hover:border-[#39FF14]/30 rounded-2xl p-4 md:p-5 transition-colors group"
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <span className={`text-[10px] font-black tracking-widest uppercase border rounded px-1.5 py-0.5 ${statusBadge.color} ${statusBadge.bg}`}>
              {statusBadge.label}
            </span>
            {confirmedOption && (
              <span className="text-[10px] font-black tracking-widest uppercase text-yellow-400 bg-yellow-400/10 border border-yellow-400/30 rounded px-1.5 py-0.5 inline-flex items-center gap-1">
                <Crown size={10} />
                {formatDateShort(confirmedOption.game_date)}
              </span>
            )}
            {poll.status === "open" && myUserId && !haveIVoted && (
              <span className="text-[10px] font-black tracking-widest uppercase text-yellow-400 bg-yellow-400/10 border border-yellow-400/30 rounded px-1.5 py-0.5 inline-flex items-center gap-1">
                <AlertTriangle size={10} />
                Vote needed
              </span>
            )}
          </div>
          <p className="text-lg md:text-xl font-black uppercase tracking-tight group-hover:text-[#39FF14] transition-colors">
            Weekend of {formatDateLong(poll.weekend_start_date)}
          </p>
          <p className="text-sm text-white/50 mt-1">
            {poll.options.length} {poll.options.length === 1 ? "option" : "options"} ·{" "}
            {totalYes} yes vote{totalYes === 1 ? "" : "s"} · {uniqueVoters} voter{uniqueVoters === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex items-center gap-2 text-white/40">
          <Users size={14} />
          <span className="text-sm tabular-nums">{uniqueVoters}</span>
        </div>
      </div>
    </Link>
  );
}

function formatDateLong(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", {
    day: "numeric", month: "long", year: "numeric",
  });
}

function formatDateShort(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", {
    weekday: "short", day: "numeric", month: "short",
  });
}
