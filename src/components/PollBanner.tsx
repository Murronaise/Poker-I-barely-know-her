"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Calendar, ChevronRight, Crown, AlertTriangle } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Poll, PollOption, Rsvp, tallyPoll, OptionTally } from "@/lib/polls";

// Drop-in banner for the dashboard.
// Checks the yearly calendar for upcoming games (next 14 days).
// Shows priority:
// 1. Game confirmed (yes >= min_players) in next 7 days, I haven't RSVP'd -> "RSVP needed"
// 2. Game confirmed in next 7 days, I said yes -> "Game on"
// 3. Game confirmed in next 7 days, anon user -> "Log in to RSVP"
// 4. No confirmed games, but weekend is coming -> "Vote needed"

type Hit = {
  dateIso: string;
  label: string;
  variant: "vote-needed" | "rsvp-needed" | "upcoming-yes" | "anon-rsvp";
};

export default function PollBanner() {
  const supabase = createSupabaseBrowserClient();
  const [hit, setHit] = useState<Hit | null>(null);

  useEffect(() => {
    let cancelled = false;

    const findRelevant = async () => {
      const { data: userResp } = await supabase.auth.getUser();
      const userId = userResp.user?.id;

      const year = new Date().getFullYear();
      const weekendStartIso = `${year}-01-01`;

      const { data: pollData } = await supabase
        .from("polls")
        .select("*")
        .eq("weekend_start_date", weekendStartIso)
        .limit(1)
        .maybeSingle();

      if (cancelled || !pollData) {
        setHit(null);
        return;
      }

      const [{ data: optsData }, { data: rsvpsData }] = await Promise.all([
        supabase.from("poll_options").select("*").eq("poll_id", pollData.id),
        supabase.from("rsvps").select("*").eq("poll_id", pollData.id),
      ]);

      const pollWithDetails = {
        ...(pollData as Poll),
        options: (optsData as PollOption[]) ?? [],
        rsvps: (rsvpsData as Rsvp[]) ?? [],
      };

      const tallies = tallyPoll(pollWithDetails);
      const minPlayers = pollWithDetails.min_players ?? 4;

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayIso = toIsoDate(today);
      const inAWeek = new Date(today);
      inAWeek.setDate(inAWeek.getDate() + 7);
      const inAWeekIso = toIsoDate(inAWeek);

      const upcomingOptions = pollWithDetails.options.filter(
        (o) => o.game_date >= todayIso && o.game_date <= inAWeekIso
      ).sort((a, b) => a.game_date.localeCompare(b.game_date));

      let hitFound: Hit | null = null;

      for (const opt of upcomingOptions) {
        const tally = tallies.get(opt.id);
        const isConfirmed = tally && tally.yes >= minPlayers;

        if (isConfirmed) {
          if (!userId) {
            hitFound = { dateIso: opt.game_date, label: opt.label, variant: "anon-rsvp" };
            break;
          }
          const myVote = pollWithDetails.rsvps.find(r => r.user_id === userId && r.poll_option_id === opt.id)?.response;
          if (!myVote) {
            hitFound = { dateIso: opt.game_date, label: opt.label, variant: "rsvp-needed" };
            break;
          } else if (myVote === "yes") {
            hitFound = { dateIso: opt.game_date, label: opt.label, variant: "upcoming-yes" };
            break;
          }
        }
      }

      // If no confirmed games, suggest voting for the upcoming weekend
      if (!hitFound && userId && upcomingOptions.length > 0) {
        // Just pick the first upcoming option to link to
        hitFound = { dateIso: upcomingOptions[0].game_date, label: upcomingOptions[0].label, variant: "vote-needed" };
      }

      if (!cancelled) setHit(hitFound);
    };

    findRelevant();

    const { data: authListener } = supabase.auth.onAuthStateChange(() => findRelevant());
    return () => {
      cancelled = true;
      authListener?.subscription.unsubscribe();
    };
  }, [supabase]);

  return (
    <AnimatePresence>
      {hit && <Banner hit={hit} />}
    </AnimatePresence>
  );
}

function Banner({ hit }: { hit: Hit }) {
  let icon: React.ReactNode;
  let title: string;
  let subtitle: string;
  let cta: string;
  let accent: string; // border + bg classes
  let iconColor: string;

  if (hit.variant === "vote-needed") {
    icon = <Calendar size={20} />;
    title = "Calendar Open";
    subtitle = `Upcoming: ${formatDateShort(hit.dateIso)} — vote on which day works.`;
    cta = "Vote now";
    accent = "border-cyan-400/40 bg-cyan-400/10";
    iconColor = "text-cyan-400";
  } else if (hit.variant === "rsvp-needed") {
    icon = <Calendar size={20} />;
    title = "RSVP needed";
    subtitle = `Game is ON for ${formatDateShort(hit.dateIso)} — let us know if you're in.`;
    cta = "RSVP";
    accent = "border-yellow-400/40 bg-yellow-400/10";
    iconColor = "text-yellow-400";
  } else if (hit.variant === "anon-rsvp") {
    icon = <Calendar size={20} />;
    title = "Game on — log in to RSVP";
    subtitle = `${formatDateShort(hit.dateIso)} — sign in or sign up so we know if you're coming.`;
    cta = "Log in";
    accent = "border-yellow-400/40 bg-yellow-400/10";
    iconColor = "text-yellow-400";
  } else {
    icon = <Crown size={20} />;
    title = `Game on — ${formatDateShort(hit.dateIso)}`;
    subtitle = "You said yes. See you there.";
    cta = "Details";
    accent = "border-[#39FF14]/40 bg-[#39FF14]/10";
    iconColor = "text-[#39FF14]";
  }

  const href = hit.variant === "anon-rsvp"
      ? "/login"
      : `/games/poll?date=${hit.dateIso}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.25 }}
      className="mb-4"
    >
      <Link
        href={href}
        className={`flex items-center gap-3 md:gap-4 rounded-2xl border backdrop-blur-xl px-4 md:px-5 py-3 md:py-4 transition-colors hover:brightness-110 ${accent}`}
      >
        <div className={`shrink-0 ${iconColor}`}>{icon}</div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-black tracking-widest uppercase text-white/80">{title}</p>
          <p className="text-sm text-white/60 truncate">{subtitle}</p>
        </div>
        <div className="flex items-center gap-1 text-[10px] sm:text-xs font-black tracking-widest uppercase text-white/80 shrink-0">
          {cta}
          <ChevronRight size={14} />
        </div>
      </Link>
    </motion.div>
  );
}

function formatDateShort(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", {
    day: "numeric", month: "short",
  });
}

function toIsoDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
