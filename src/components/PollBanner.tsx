"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Calendar, ChevronRight, Crown, AlertTriangle } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Poll, PollOption, Rsvp, tallyPoll } from "@/lib/polls";

// Drop-in banner for the dashboard. Shows four things in priority order:
//   1. There's an open poll for this weekend that I haven't voted on → "Vote now"
//   2. There's a confirmed game in the next 7 days I haven't RSVP'd to → "RSVP"
//   3. There's a confirmed game with yeses below the minimum → "Re-poll needed"
//   4. There's a confirmed game in the next 7 days I said yes to → reminder
// Renders nothing if none of the above match.

type Hit = {
  poll: Poll;
  options: PollOption[];
  rsvps: Rsvp[];
  variant: "vote-needed" | "rsvp-needed" | "below-min" | "upcoming-yes";
};

export default function PollBanner() {
  const supabase = createSupabaseBrowserClient();
  const [hit, setHit] = useState<Hit | null>(null);

  useEffect(() => {
    let cancelled = false;

    const findRelevant = async () => {
      const { data: userResp } = await supabase.auth.getUser();
      const userId = userResp.user?.id;

      // Pull every poll that's open or confirmed and look back ~6 weeks for
      // recency. Small data, fine to load fully on the client.
      const sixWeeksAgo = new Date();
      sixWeeksAgo.setDate(sixWeeksAgo.getDate() - 42);

      const [{ data: pollsData }, { data: optsData }, { data: rsvpsData }] = await Promise.all([
        supabase
          .from("polls")
          .select("*")
          .in("status", ["open", "confirmed"])
          .gte("weekend_start_date", toIsoDate(sixWeeksAgo))
          .order("weekend_start_date", { ascending: true }),
        supabase.from("poll_options").select("*"),
        supabase.from("rsvps").select("*"),
      ]);

      if (cancelled || !pollsData?.length) {
        setHit(null);
        return;
      }

      const optsByPoll: Record<string, PollOption[]> = {};
      (optsData ?? []).forEach((o: PollOption) => {
        (optsByPoll[o.poll_id] ||= []).push(o);
      });
      const rsvpsByPoll: Record<string, Rsvp[]> = {};
      (rsvpsData ?? []).forEach((r: Rsvp) => {
        (rsvpsByPoll[r.poll_id] ||= []).push(r);
      });

      // Priority 1: an open poll where I haven't voted at all.
      if (userId) {
        for (const p of pollsData as Poll[]) {
          if (p.status !== "open") continue;
          const myVotes = (rsvpsByPoll[p.id] ?? []).filter((r) => r.user_id === userId);
          if (myVotes.length === 0) {
            setHit({ poll: p, options: optsByPoll[p.id] ?? [], rsvps: rsvpsByPoll[p.id] ?? [], variant: "vote-needed" });
            return;
          }
        }
      }

      // Priority 2: a confirmed poll inside the next 7 days where the
      // signed-in user has no RSVP on the confirmed option yet. Nudges
      // late joiners to commit one way or the other so the head count is
      // accurate by game day.
      if (userId) {
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const inAWeek = new Date(today); inAWeek.setDate(inAWeek.getDate() + 7);

        for (const p of pollsData as Poll[]) {
          if (p.status !== "confirmed" || !p.confirmed_option_id) continue;
          const opt = (optsByPoll[p.id] ?? []).find((o) => o.id === p.confirmed_option_id);
          if (!opt) continue;
          const gameDate = new Date(opt.game_date + "T00:00:00");
          if (gameDate < today || gameDate > inAWeek) continue;
          const haveIRsvpd = (rsvpsByPoll[p.id] ?? []).some(
            (r) => r.user_id === userId && r.poll_option_id === opt.id,
          );
          if (!haveIRsvpd) {
            setHit({ poll: p, options: optsByPoll[p.id] ?? [], rsvps: rsvpsByPoll[p.id] ?? [], variant: "rsvp-needed" });
            return;
          }
        }
      }

      // Priority 3: a confirmed poll where yes-count for the confirmed option
      // has fallen below min_players (so admin needs to repoll).
      for (const p of pollsData as Poll[]) {
        if (p.status !== "confirmed" || !p.confirmed_option_id) continue;
        const tallies = tallyPoll({
          ...p,
          options: optsByPoll[p.id] ?? [],
          rsvps: rsvpsByPoll[p.id] ?? [],
        });
        const yes = tallies.get(p.confirmed_option_id)?.yes ?? 0;
        if (yes < p.min_players) {
          setHit({ poll: p, options: optsByPoll[p.id] ?? [], rsvps: rsvpsByPoll[p.id] ?? [], variant: "below-min" });
          return;
        }
      }

      // Priority 4: confirmed game in the next 7 days that I said yes to.
      if (userId) {
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const inAWeek = new Date(today); inAWeek.setDate(inAWeek.getDate() + 7);

        for (const p of pollsData as Poll[]) {
          if (p.status !== "confirmed" || !p.confirmed_option_id) continue;
          const opt = (optsByPoll[p.id] ?? []).find((o) => o.id === p.confirmed_option_id);
          if (!opt) continue;
          const gameDate = new Date(opt.game_date + "T00:00:00");
          if (gameDate < today || gameDate > inAWeek) continue;
          const myYes = (rsvpsByPoll[p.id] ?? []).some((r) => r.user_id === userId && r.poll_option_id === opt.id && r.response === "yes");
          if (myYes) {
            setHit({ poll: p, options: optsByPoll[p.id] ?? [], rsvps: rsvpsByPoll[p.id] ?? [], variant: "upcoming-yes" });
            return;
          }
        }
      }

      setHit(null);
    };

    findRelevant();

    // Re-run when auth state changes (e.g. user logs in).
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
  const opt = hit.poll.confirmed_option_id
    ? hit.options.find((o) => o.id === hit.poll.confirmed_option_id)
    : null;

  let icon: React.ReactNode;
  let title: string;
  let subtitle: string;
  let cta: string;
  let accent: string; // border + bg classes
  let iconColor: string;

  if (hit.variant === "vote-needed") {
    icon = <Calendar size={20} />;
    title = "Poll open";
    subtitle = `Weekend of ${formatDateShort(hit.poll.weekend_start_date)} — vote on which day works.`;
    cta = "Vote now";
    accent = "border-cyan-400/40 bg-cyan-400/10";
    iconColor = "text-cyan-400";
  } else if (hit.variant === "rsvp-needed") {
    icon = <Calendar size={20} />;
    title = "RSVP needed";
    subtitle = opt
      ? `Game on ${formatDateShort(opt.game_date)} — let us know if you're in.`
      : "Confirm whether you're coming.";
    cta = "RSVP";
    accent = "border-yellow-400/40 bg-yellow-400/10";
    iconColor = "text-yellow-400";
  } else if (hit.variant === "below-min") {
    icon = <AlertTriangle size={20} />;
    title = "Re-poll needed";
    subtitle = `Confirmed day has dropped below ${hit.poll.min_players} yeses. Pick an alternative.`;
    cta = "Open poll";
    accent = "border-red-400/40 bg-red-400/10";
    iconColor = "text-red-400";
  } else {
    icon = <Crown size={20} />;
    title = `Game on — ${opt ? formatDateShort(opt.game_date) : "this weekend"}`;
    subtitle = opt ? `${opt.start_time.slice(0, 5)} · you said yes` : "You're confirmed.";
    cta = "Details";
    accent = "border-[#39FF14]/40 bg-[#39FF14]/10";
    iconColor = "text-[#39FF14]";
  }

  // "Vote needed" can match several open polls in a row (the cron creates
  // weekend drafts in advance). Deep-linking to one buries the others, so
  // for that variant we route to the polls list instead. The other two
  // variants (below-min, upcoming-yes) are specific to a single poll, so
  // they keep their direct link.
  const href = hit.variant === "vote-needed"
    ? "/games/poll"
    : `/games/poll/${hit.poll.id}`;

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
        {/* Show the CTA label at every width — the lone chevron on mobile was
            a weak affordance and made the banner feel decorative. */}
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
