"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useIsMounted } from "@/lib/use-hydration";
import { useLiveGameId } from "@/lib/live-game-store";
import { useReducedMotion } from "framer-motion";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  Trophy,
  Swords,
  CircleDollarSign,
  Anchor,
  Pizza,
  Timer,
  Zap,
  Users,
  Activity,
  Coins,
  TrendingUp,
  Plus,
  Calendar,
  Crown,
  ChevronRight,
  History,
} from "lucide-react";
import { motion } from "framer-motion";
import type { Variants } from "framer-motion";
import Link from "next/link";
import PlayerAvatar from "@/components/PlayerAvatar";
import Sparkline from "@/components/Sparkline";
import PollBanner from "@/components/PollBanner";
import AdminLedgerSummary from "@/components/AdminLedgerSummary";
import YearlyRecapBanner from "@/components/YearlyRecapBanner";
import { historicalGames } from "@/lib/historical-games";
import { getStoredPlayers } from "@/lib/local-store";
import { loadRegisteredPlayers } from "@/lib/registered-players";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const pageVariants: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.12 } },
};

const sectionVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
};

type MetricCard = {
  id: number;
  title: string;
  subtext: string;
  /** Slug into /leaderboards?category=<slug>. Kept explicit so we can rename
   *  the displayed title without breaking the link. */
  categorySlug: string;
  player: string;
  value: string;
  icon: typeof Trophy;
  valColor: string;
  themeColor: string;
  themeRgb: string;
  runnerUp: { name: string; value: string };
  lead: string;
  trend: number[];
  trendPositive: boolean;
};

// Per-player lifetime stats — derived from the historical session log so the
// dashboard metrics, runner-up labels, and sparkline trends stay accurate as
// new sessions land in historicalGames.ts (was previously a frozen snapshot
// of leaders from a specific date).
type PlayerLifetimeStats = {
  name: string;
  netLifetime: number;
  totalBuyIn: number;
  totalFood: number;
  sessions: number;
  winRate: number;          // 0..100
  bestSingleNet: number;
  worstSingleNet: number;
  worstSingleDate: string;
  swing: number;
  netTrend: number[];       // running cumulative net
  winRateTrend: number[];   // running win-rate %
  volumeTrend: number[];    // running cumulative buy-ins
  foodTrend: number[];      // running cumulative food spend
  worstTrend: number[];     // running worst single-night net
  sessionCountTrend: number[];
  swingTrend: number[];
};

const lifetimeStats: PlayerLifetimeStats[] = (() => {
  type SessionEntry = { date: string; net: number; buyIn: number; food: number };
  const byName = new Map<string, SessionEntry[]>();
  // Walk chronologically (historicalGames is most-recent-first) so trend
  // arrays read left → right oldest → newest.
  [...historicalGames].reverse().forEach((g) => {
    g.players.forEach((p) => {
      const net = p.cashOut - p.buyIn;
      if (!byName.has(p.name)) byName.set(p.name, []);
      byName.get(p.name)!.push({ date: g.date, net, buyIn: p.buyIn, food: p.food });
    });
  });

  const padTrend = (trend: number[]): number[] => {
    const out = [...trend];
    while (out.length < 6) out.unshift(0);
    return out;
  };

  return [...byName.entries()].map(([name, sessions]): PlayerLifetimeStats => {
    const netLifetime = sessions.reduce((s, x) => s + x.net, 0);
    const totalBuyIn = sessions.reduce((s, x) => s + x.buyIn, 0);
    const totalFood = sessions.reduce((s, x) => s + x.food, 0);
    const wins = sessions.filter((x) => x.net >= 0).length;
    const winRate = sessions.length > 0 ? Math.round((100 * wins) / sessions.length) : 0;
    const bestSingleNet = sessions.reduce((b, x) => Math.max(b, x.net), -Infinity);
    const worstEntry = sessions.reduce(
      (worst, x) => (x.net < worst.net ? x : worst),
      sessions[0],
    );

    // Build running trends in one pass.
    const netTrend: number[] = [];
    const winRateTrend: number[] = [];
    const volumeTrend: number[] = [];
    const foodTrend: number[] = [];
    const worstTrend: number[] = [];
    const sessionCountTrend: number[] = [];
    const swingTrend: number[] = [];
    let runningNet = 0;
    let runningWins = 0;
    let runningVolume = 0;
    let runningFood = 0;
    let runningWorst = Infinity;
    let runningBest = -Infinity;
    sessions.forEach((s, idx) => {
      runningNet += s.net;
      if (s.net >= 0) runningWins += 1;
      runningVolume += s.buyIn;
      runningFood += s.food;
      runningWorst = Math.min(runningWorst, s.net);
      runningBest = Math.max(runningBest, s.net);
      netTrend.push(Number(runningNet.toFixed(2)));
      winRateTrend.push(Math.round((100 * runningWins) / (idx + 1)));
      volumeTrend.push(Number(runningVolume.toFixed(2)));
      foodTrend.push(Number(runningFood.toFixed(2)));
      worstTrend.push(Number(runningWorst.toFixed(2)));
      sessionCountTrend.push(idx + 1);
      swingTrend.push(Number((runningBest - runningWorst).toFixed(2)));
    });

    return {
      name,
      netLifetime: Number(netLifetime.toFixed(2)),
      totalBuyIn: Number(totalBuyIn.toFixed(2)),
      totalFood: Number(totalFood.toFixed(2)),
      sessions: sessions.length,
      winRate,
      bestSingleNet: Number(bestSingleNet.toFixed(2)),
      worstSingleNet: Number(worstEntry.net.toFixed(2)),
      worstSingleDate: worstEntry.date,
      swing: Number((bestSingleNet - worstEntry.net).toFixed(2)),
      netTrend: padTrend(netTrend),
      winRateTrend: padTrend(winRateTrend),
      volumeTrend: padTrend(volumeTrend),
      foodTrend: padTrend(foodTrend),
      worstTrend: padTrend(worstTrend),
      sessionCountTrend: padTrend(sessionCountTrend),
      swingTrend: padTrend(swingTrend),
    };
  });
})();

const formatSigned = (n: number) =>
  `${n >= 0 ? "+" : "-"}£${Math.abs(n).toFixed(2)}`;

// "Pick top by metric" helper that returns the leader, the runner-up, and a
// tie flag so the lead-line text can say "tied with X" instead of pretending
// there's a clear winner.
function topBy(
  rows: PlayerLifetimeStats[],
  pick: (p: PlayerLifetimeStats) => number,
  tieBreak?: (p: PlayerLifetimeStats) => number,
): { leader: PlayerLifetimeStats; runnerUp: PlayerLifetimeStats | null; tied: boolean } {
  if (rows.length === 0) {
    throw new Error("topBy: no players to rank — historicalGames is empty");
  }
  const sorted = [...rows].sort((a, b) => {
    const diff = pick(b) - pick(a);
    if (diff !== 0 || !tieBreak) return diff;
    return tieBreak(b) - tieBreak(a);
  });
  const leader = sorted[0];
  const runnerUp = sorted[1] ?? null;
  const tied = runnerUp ? pick(runnerUp) === pick(leader) : false;
  return { leader, runnerUp, tied };
}

const metrics: MetricCard[] = (() => {
  if (lifetimeStats.length === 0) return [];

  // Money Printer — biggest lifetime net.
  const overall = topBy(lifetimeStats, (p) => p.netLifetime);
  // The Shark — highest win rate, break ties by lifetime net so we don't keep
  // a player with a single lucky session at the top.
  const shark = topBy(lifetimeStats, (p) => p.winRate, (p) => p.netLifetime);
  // The Whale — most chips pushed across the table (sum of buy-ins).
  const whale = topBy(lifetimeStats, (p) => p.totalBuyIn);
  // The Tank — worst single-night beating. Pick by lowest single-session net;
  // sort ASCENDING here, so flip the picker sign.
  const tank = topBy(lifetimeStats, (p) => -p.worstSingleNet);
  // The Vacuum — most food eaten.
  const vacuum = topBy(lifetimeStats, (p) => p.totalFood);
  // The Grinder — most sessions played.
  const grinder = topBy(lifetimeStats, (p) => p.sessions);
  // The Maniac — biggest swing between best and worst nights.
  const maniac = topBy(lifetimeStats, (p) => p.swing);

  const overUnderText = (delta: number, suffix: string) =>
    `${formatSigned(delta)} ${suffix}`;

  return [
    {
      id: 1, title: "Money Printer", subtext: "The biggest all-time winner.",
      categorySlug: "overall-leader",
      player: overall.leader.name,
      value: formatSigned(overall.leader.netLifetime),
      icon: Trophy, valColor: "text-[#39FF14]",
      themeColor: "text-yellow-400", themeRgb: "250,204,21",
      runnerUp: overall.runnerUp
        ? { name: overall.runnerUp.name, value: formatSigned(overall.runnerUp.netLifetime) }
        : { name: "—", value: "—" },
      lead: overall.runnerUp
        ? overUnderText(overall.leader.netLifetime - overall.runnerUp.netLifetime, "ahead")
        : "no challengers",
      trend: overall.leader.netTrend,
      trendPositive: overall.leader.netLifetime >= 0,
    },
    {
      id: 2, title: "Probably Cheating", subtext: "Wins so consistently it raises eyebrows.",
      categorySlug: "the-shark",
      player: shark.leader.name,
      value: `${shark.leader.winRate}%`,
      icon: Swords, valColor: "text-[#39FF14]",
      themeColor: "text-[#39FF14]", themeRgb: "57,255,20",
      runnerUp: shark.runnerUp
        ? { name: shark.runnerUp.name, value: `${shark.runnerUp.winRate}%` }
        : { name: "—", value: "—" },
      lead: shark.tied
        ? `tied — ${shark.leader.name} biggest profit`
        : shark.runnerUp
          ? `+${shark.leader.winRate - shark.runnerUp.winRate}% over runner-up`
          : "no challengers",
      trend: shark.leader.winRateTrend,
      trendPositive: true,
    },
    {
      id: 3, title: "Mortgage Material", subtext: "Has pushed the most chips across the table.",
      categorySlug: "the-whale",
      player: whale.leader.name,
      value: `£${whale.leader.totalBuyIn.toLocaleString()}`,
      icon: CircleDollarSign, valColor: "text-cyan-400",
      themeColor: "text-cyan-400", themeRgb: "34,211,238",
      runnerUp: whale.runnerUp
        ? { name: whale.runnerUp.name, value: `£${whale.runnerUp.totalBuyIn.toLocaleString()}` }
        : { name: "—", value: "—" },
      lead: whale.runnerUp
        ? `+£${(whale.leader.totalBuyIn - whale.runnerUp.totalBuyIn).toFixed(2)} over runner-up`
        : "no challengers",
      trend: whale.leader.volumeTrend,
      trendPositive: true,
    },
    {
      id: 4, title: "The Pit", subtext: "Took the worst beating in a single night.",
      categorySlug: "the-tank",
      player: tank.leader.name,
      value: formatSigned(tank.leader.worstSingleNet),
      icon: Anchor, valColor: "text-red-400",
      themeColor: "text-red-400", themeRgb: "248,113,113",
      runnerUp: tank.runnerUp
        ? { name: tank.runnerUp.name, value: formatSigned(tank.runnerUp.worstSingleNet) }
        : { name: "—", value: "—" },
      lead: `${tank.leader.worstSingleDate} session`,
      trend: tank.leader.worstTrend,
      trendPositive: false,
    },
    {
      id: 5, title: "Food Gremlin", subtext: "Eats more than they play.",
      categorySlug: "the-vacuum",
      player: vacuum.leader.name,
      value: `£${vacuum.leader.totalFood.toFixed(2)}`,
      icon: Pizza, valColor: "text-orange-400",
      themeColor: "text-orange-400", themeRgb: "251,146,60",
      runnerUp: vacuum.runnerUp
        ? { name: vacuum.runnerUp.name, value: `£${vacuum.runnerUp.totalFood.toFixed(2)}` }
        : { name: "—", value: "—" },
      lead: vacuum.runnerUp
        ? `+£${(vacuum.leader.totalFood - vacuum.runnerUp.totalFood).toFixed(2)} over runner-up`
        : "no challengers",
      trend: vacuum.leader.foodTrend,
      trendPositive: true,
    },
    {
      id: 6, title: "Part of the Furniture", subtext: "Never misses a session — practically lives at the table.",
      categorySlug: "the-grinder",
      player: grinder.leader.name,
      value: `${grinder.leader.sessions} Session${grinder.leader.sessions === 1 ? "" : "s"}`,
      icon: Timer, valColor: "text-blue-400",
      themeColor: "text-blue-400", themeRgb: "96,165,250",
      runnerUp: grinder.runnerUp
        ? { name: grinder.runnerUp.name, value: String(grinder.runnerUp.sessions) }
        : { name: "—", value: "—" },
      lead: grinder.tied
        ? `tied with ${lifetimeStats
            .filter((p) => p.sessions === grinder.leader.sessions && p.name !== grinder.leader.name)
            .map((p) => p.name)
            .slice(0, 2)
            .join(" & ") || "—"}`
        : grinder.runnerUp
          ? `+${grinder.leader.sessions - grinder.runnerUp.sessions} over runner-up`
          : "no challengers",
      trend: grinder.leader.sessionCountTrend,
      trendPositive: true,
    },
    {
      id: 7, title: "Cardiac Episode", subtext: "Wild swings between best and worst nights.",
      categorySlug: "the-maniac",
      player: maniac.leader.name,
      value: `£${maniac.leader.swing.toFixed(2)} Swing`,
      icon: Zap, valColor: "text-purple-400",
      themeColor: "text-purple-400", themeRgb: "192,132,252",
      runnerUp: maniac.runnerUp
        ? { name: maniac.runnerUp.name, value: `£${maniac.runnerUp.swing.toFixed(2)}` }
        : { name: "—", value: "—" },
      lead: `${formatSigned(maniac.leader.worstSingleNet)} to ${formatSigned(maniac.leader.bestSingleNet)}`,
      trend: maniac.leader.swingTrend,
      trendPositive: true,
    },
  ];
})();

// Lifetime poker net per player for the dashboard chart (cash-out minus
// buy-in, food settled separately). `magnitude` is what Recharts uses for
// the bar height so every stack grows up from the same £0 baseline;
// `profit` keeps the sign so the chip shape can colour itself green / red
// and the tooltip can show the real value. Sorted by profit descending so
// the biggest winner sits on the left.
const trueDataArray = lifetimeStats
  .map((p) => ({
    name: p.name,
    profit: p.netLifetime,
    magnitude: Math.abs(p.netLifetime),
  }))
  .sort((a, b) => b.profit - a.profit);

// Derive all headline numbers from `historicalGames` so they stay accurate
// when sessions are added or removed.
const totalVolume = historicalGames.reduce((sum, g) => sum + g.totalPot, 0);
const seedPlayerNamesLower = new Set(
  historicalGames.flatMap((g) => g.players.map((p) => p.name.toLowerCase())),
);
const uniquePlayerCount = seedPlayerNamesLower.size;
const biggestGame = historicalGames.reduce(
  (best, g) => (g.totalPot > (best?.totalPot ?? 0) ? g : best),
  historicalGames[0],
);

const headlineStats: {
  label: string;
  value: string;
  icon: typeof Activity;
  color: string;
  href: string;
  ariaLabel: string;
}[] = [
  {
    label: "Sessions",
    value: String(historicalGames.length),
    icon: Activity,
    color: "text-[#39FF14]",
    href: "/games",
    ariaLabel: `${historicalGames.length} sessions tracked. Open games list.`,
  },
  {
    label: "Total Volume",
    value: `£${totalVolume.toLocaleString()}`,
    icon: Coins,
    color: "text-cyan-400",
    href: "/stats",
    ariaLabel: `Total volume £${totalVolume}. Open volume breakdown.`,
  },
  {
    label: "Players",
    value: String(uniquePlayerCount),
    icon: Users,
    color: "text-yellow-400",
    href: "/players",
    ariaLabel: `${uniquePlayerCount} players. Open roster.`,
  },
  {
    label: "Biggest Pot",
    value: `£${biggestGame.totalPot.toLocaleString()}`,
    icon: TrendingUp,
    color: "text-[#39FF14]",
    href: `/games/history/${biggestGame.id}`,
    ariaLabel: `Biggest pot £${biggestGame.totalPot} on ${biggestGame.date}. Open that session.`,
  },
];

const recentSessions = historicalGames.slice(0, 4).map((g) => {
  const ranked = [...g.players]
    .map((p) => ({ ...p, net: p.cashOut - p.buyIn }))
    .sort((a, b) => b.net - a.net);
  const winner = ranked[0];
  return {
    id: g.id,
    date: g.date,
    duration: g.duration,
    blinds: g.blinds,
    pot: g.totalPot,
    playerCount: g.players.length,
    winner: { name: winner.name, net: winner.net, cashOut: winner.cashOut, buyIn: winner.buyIn },
  };
});

type ChipStackProps = {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  payload?: { name: string; profit: number };
};

const ChipStackShape = (props: ChipStackProps) => {
  const { x = 0, y = 0, width = 0, height = 0, payload } = props;
  if (!payload || height === 0 || isNaN(height)) return null;

  const isPositive = payload.profit >= 0;
  const chipThickness = 10;
  const numChips = Math.max(1, Math.ceil(Math.abs(height) / chipThickness));

  const cx = x + width / 2;
  const rx = width / 2 - 6;
  const ry = rx * 0.35;
  const baseLine = y + height;
  const baseColor = isPositive ? "#22c55e" : "#ef4444";
  const darkColor = isPositive ? "#14532d" : "#7f1d1d";

  // CSS-driven drop-in (see `chip-drop` keyframes in globals.css). Cheaper than
  // a per-chip Framer Motion node — one animation per chip, GPU-composited,
  // and automatically suppressed by `prefers-reduced-motion`.
  const chips = [];

  for (let i = 0; i < numChips; i++) {
    const chipY = baseLine - chipThickness * (i + 1);
    // i = 0 is the bottom chip; it lands first, the rest stack on top of it.
    const delay = `${i * 60}ms`;

    chips.push(
      <g
        key={`${payload.name}-${i}`}
        className="chip-drop"
        style={{ animationDelay: delay }}
      >
        <ellipse cx={cx} cy={chipY + chipThickness} rx={rx} ry={ry} fill={darkColor} />
        <rect x={cx - rx} y={chipY} width={rx * 2} height={chipThickness} fill={darkColor} />
        <rect x={cx - rx} y={chipY} width={3} height={chipThickness} fill="#ffffff" opacity={0.8} />
        <rect x={cx + rx - 3} y={chipY} width={3} height={chipThickness} fill="#ffffff" opacity={0.8} />
        <rect x={cx - 3} y={chipY} width={6} height={chipThickness} fill="#ffffff" opacity={0.8} />
        <ellipse cx={cx} cy={chipY} rx={rx} ry={ry} fill={baseColor} />
        <ellipse cx={cx} cy={chipY} rx={rx * 0.75} ry={ry * 0.75} fill="transparent" stroke="#ffffff" strokeWidth={1.5} strokeDasharray="3 3" opacity={0.9} />
        <ellipse cx={cx} cy={chipY} rx={rx * 0.4} ry={ry * 0.4} fill={darkColor} opacity={0.3} />
      </g>
    );
  }

  return <g>{chips}</g>;
};

export default function Dashboard() {
  const router = useRouter();
  const chartData = trueDataArray;
  const [avatarMap, setAvatarMap] = useState<Record<string, string>>({});
  const [avatarsLoading, setAvatarsLoading] = useState(true);
  const isMounted = useIsMounted();
  const liveGameId = useLiveGameId();
  const reduceMotion = useReducedMotion();

  // Extra players that exist on /players but aren't in seed history — fresh
  // signups (Supabase `users` table) and locally-added test accounts. Without
  // this the headline "Players" tile drifts out of sync with the roster as
  // soon as someone signs up, since `uniquePlayerCount` is static seed-only.
  // Initialised to 0 so SSR markup matches the first client render, then
  // bumped after mount once async data resolves.
  const [extraPlayerCount, setExtraPlayerCount] = useState(0);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const sb = createSupabaseBrowserClient();
      const registered = await loadRegisteredPlayers(sb);
      if (cancelled) return;
      const extraNames = new Set<string>();
      registered.forEach((_displayName, lower) => {
        if (!seedPlayerNamesLower.has(lower)) extraNames.add(lower);
      });
      getStoredPlayers().forEach((p) => {
        const lower = p.name.toLowerCase();
        if (!seedPlayerNamesLower.has(lower)) extraNames.add(lower);
      });
      setExtraPlayerCount(extraNames.size);
    })();
    return () => { cancelled = true; };
  }, []);
  const totalPlayerCount = uniquePlayerCount + extraPlayerCount;

  // Coarse-pointer detection so we can swap the desktop CSS-marquee for a
  // native horizontal scroller on phones / tablets. Native scroll lets users
  // pan with the same gesture they already use everywhere else (no fight with
  // vertical page scroll) and gives us inertia for free.
  const [isCoarsePointer, setIsCoarsePointer] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    const update = () => setIsCoarsePointer(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const marqueeScrollerRef = useRef<HTMLDivElement>(null);
  const marqueeRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | undefined>(undefined);
  const posRef = useRef(0);
  const halfWidthRef = useRef(0);
  const isPausedRef = useRef(false);
  const dragRef = useRef<{
    active: boolean;
    startX: number;
    startPos: number;
    lastX: number;
    velocity: number;
    moved: boolean;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchDashboardData() {
      try {
        const { data: playersData } = await supabase
          .from("players")
          .select("name, avatar_url");
        if (cancelled) return;
        if (playersData) {
          const map: Record<string, string> = {};
          playersData.forEach((p: { name: string; avatar_url?: string | null }) => {
            if (p.avatar_url) map[p.name] = p.avatar_url;
          });
          setAvatarMap(map);
        }
      } catch {
        // Stub client / network failure — fall back to placeholder avatars.
      } finally {
        if (!cancelled) setAvatarsLoading(false);
      }
    }
    fetchDashboardData();
    return () => {
      cancelled = true;
    };
  }, []);

  // Continuous auto-scroll driven by RAF. On desktop/fine-pointer we shift the
  // inner row with a CSS transform (so click-and-drag can swap in mid-stream).
  // On coarse-pointer (touch) we drive the *native* scroller's scrollLeft —
  // that way a finger swipe pans the same scroller and the row keeps creeping
  // even after the user lets go. The duplicated content list lets us subtract
  // halfWidth at the wrap point so the loop is seamless in both modes.
  useEffect(() => {
    const scroller = marqueeScrollerRef.current;
    const inner = marqueeRef.current;
    if (!scroller || !inner) return;

    const measure = () => {
      halfWidthRef.current = inner.scrollWidth / 2;
    };

    const tick = () => {
      if (!dragRef.current?.active && !isPausedRef.current && halfWidthRef.current > 0) {
        if (isCoarsePointer) {
          // Skip the increment if the user is mid-touch — `isPausedRef` flips
          // on touchstart below — but always reset the wrap so jumping past
          // halfWidth via inertia still loops cleanly.
          scroller.scrollLeft += 0.55;
          if (scroller.scrollLeft >= halfWidthRef.current) {
            scroller.scrollLeft -= halfWidthRef.current;
          }
        } else {
          posRef.current -= 0.55;
          if (Math.abs(posRef.current) >= halfWidthRef.current) {
            posRef.current += halfWidthRef.current;
          }
          inner.style.transform = `translateX(${posRef.current}px)`;
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    const timer = setTimeout(() => {
      measure();
      rafRef.current = requestAnimationFrame(tick);
    }, 120);

    return () => {
      clearTimeout(timer);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isCoarsePointer]);

  // Touch interaction on mobile: pause auto-scroll while the user is panning
  // with their finger and for a short grace period afterwards (so the marquee
  // doesn't fight inertial scroll).
  useEffect(() => {
    if (!isCoarsePointer) return;
    const scroller = marqueeScrollerRef.current;
    if (!scroller) return;

    let resumeTimer: ReturnType<typeof setTimeout> | null = null;
    const pause = () => {
      isPausedRef.current = true;
      if (resumeTimer) clearTimeout(resumeTimer);
    };
    const resumeSoon = () => {
      if (resumeTimer) clearTimeout(resumeTimer);
      resumeTimer = setTimeout(() => { isPausedRef.current = false; }, 1500);
    };

    scroller.addEventListener("touchstart", pause, { passive: true });
    scroller.addEventListener("touchend", resumeSoon, { passive: true });
    scroller.addEventListener("touchcancel", resumeSoon, { passive: true });

    return () => {
      scroller.removeEventListener("touchstart", pause);
      scroller.removeEventListener("touchend", resumeSoon);
      scroller.removeEventListener("touchcancel", resumeSoon);
      if (resumeTimer) clearTimeout(resumeTimer);
    };
  }, [isCoarsePointer]);

  const handleMarqueePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isCoarsePointer) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      active: true,
      startX: e.clientX,
      startPos: posRef.current,
      lastX: e.clientX,
      velocity: 0,
      moved: false,
    };
  };

  const handleMarqueePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d?.active || !marqueeRef.current) return;
    const delta = e.clientX - d.startX;
    if (Math.abs(delta) > 4) d.moved = true;
    d.velocity = e.clientX - d.lastX;
    d.lastX = e.clientX;
    posRef.current = d.startPos + delta;
    if (halfWidthRef.current > 0) {
      while (posRef.current > 0) posRef.current -= halfWidthRef.current;
      while (Math.abs(posRef.current) >= halfWidthRef.current) posRef.current += halfWidthRef.current;
    }
    marqueeRef.current.style.transform = `translateX(${posRef.current}px)`;
  };

  const handleMarqueePointerUp = () => {
    const d = dragRef.current;
    if (!d?.active) return;
    d.active = false;
    let v = d.velocity * 0.5;
    const coast = () => {
      v *= 0.93;
      if (Math.abs(v) < 0.15) {
        // Keep `dragRef` set briefly so the click handler on the underlying
        // card can detect "this was a drag, swallow the click".
        setTimeout(() => {
          if (dragRef.current && !dragRef.current.active) dragRef.current = null;
        }, 120);
        return;
      }
      posRef.current += v;
      if (halfWidthRef.current > 0) {
        while (posRef.current > 0) posRef.current -= halfWidthRef.current;
        while (Math.abs(posRef.current) >= halfWidthRef.current) posRef.current += halfWidthRef.current;
      }
      if (marqueeRef.current) {
        marqueeRef.current.style.transform = `translateX(${posRef.current}px)`;
      }
      requestAnimationFrame(coast);
    };
    requestAnimationFrame(coast);
  };

  // Keyboard nav for the marquee row: ← / → scrolls one card at a time on
  // touch (where the row is a native scroller); on desktop, nudge the JS pos.
  const handleMarqueeKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    if (isCoarsePointer) {
      const el = marqueeScrollerRef.current;
      if (!el) return;
      const card = el.querySelector<HTMLElement>("[data-marquee-card]");
      const step = (card?.offsetWidth ?? 320) + 20;
      if (e.key === "ArrowLeft") el.scrollBy({ left: -step, behavior: "smooth" });
      else if (e.key === "ArrowRight") el.scrollBy({ left: step, behavior: "smooth" });
      else if (e.key === "Home") el.scrollTo({ left: 0, behavior: "smooth" });
      else el.scrollTo({ left: el.scrollWidth, behavior: "smooth" });
    } else if (marqueeRef.current) {
      const step = 360;
      posRef.current += e.key === "ArrowLeft" ? step : e.key === "ArrowRight" ? -step : 0;
      if (e.key === "Home") posRef.current = 0;
      if (halfWidthRef.current > 0) {
        while (posRef.current > 0) posRef.current -= halfWidthRef.current;
        while (Math.abs(posRef.current) >= halfWidthRef.current) posRef.current += halfWidthRef.current;
      }
      marqueeRef.current.style.transform = `translateX(${posRef.current}px)`;
    }
  };

  // When the user has `prefers-reduced-motion`, skip the staggered page-level
  // entrance entirely so nothing fades or shifts on mount.
  const motionInitial = reduceMotion ? false : "hidden";

  return (
    <motion.div
      variants={pageVariants}
      initial={motionInitial}
      animate="show"
      className="flex-1 flex flex-col md:min-h-0 md:overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(57,255,20,0.08)_0%,_rgba(14,17,23,1)_60%)] text-[#FAFAFA]"
    >
      {/* Hero strip — live/start CTA only. Title and date were removed to give
          mobile dashboards more room for the cards below. On mobile we hide
          the "Start New Game" CTA entirely (admins can still launch a game
          from the games list page); the live-session CTA only renders when
          there's an active game today (useLiveGameId enforces the date check
          and returns null on SSR, so no hydration mismatch). */}
      <motion.div
        variants={sectionVariants}
        className={`px-4 md:px-6 xl:px-12 pt-3 pb-2 shrink-0 ${
          liveGameId ? "" : "hidden md:block"
        }`}
      >
          <div className="flex items-center justify-end gap-3">
            {liveGameId ? (
              <Link href={`/games/${liveGameId}`}>
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  className="inline-flex items-center gap-2.5 px-6 py-3 bg-red-500/10 border border-red-500/40 text-red-400 font-black tracking-widest uppercase rounded-xl text-base hover:bg-red-500/20 hover:border-red-500/60 transition-all"
                >
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
                  </span>
                  Join Live Game
                  <ChevronRight size={14} />
                </motion.button>
              </Link>
            ) : (
              <Link href="/games/create">
                <button className="relative group overflow-hidden rounded-xl p-[1px]">
                  <span className="absolute inset-0 bg-gradient-to-r from-[#39FF14] to-cyan-400 rounded-xl opacity-70 group-hover:opacity-100 transition-opacity blur-sm"></span>
                  <div className="relative bg-black/50 backdrop-blur-xl px-5 py-2.5 rounded-xl flex items-center justify-center gap-2 border border-white/10 group-hover:border-[#39FF14]/50 transition-colors">
                    <Plus className="text-[#39FF14]" size={18} />
                    <span className="font-bold text-base tracking-wide text-white group-hover:text-[#39FF14] transition-colors uppercase">
                      Start New Game
                    </span>
                  </div>
                </button>
              </Link>
            )}
          </div>
      </motion.div>

      {/* Poll banner — only renders when there's a relevant poll for this user */}
      <div className="px-4 md:px-6 xl:px-12 shrink-0">
        <PollBanner />
      </div>

      {/* Admin-only outstanding-balance summary — self-suppresses for
          non-admins and for sessions with nothing pending. */}
      <div className="px-4 md:px-6 xl:px-12 shrink-0">
        <AdminLedgerSummary />
      </div>

      {/* Yearly recap banner — self-suppresses outside of the windows
          where a recap is meaningful. */}
      <div className="px-4 md:px-6 xl:px-12 shrink-0">
        <YearlyRecapBanner />
      </div>

      {/* Headline stats */}
      <motion.div variants={sectionVariants} className="px-4 md:px-6 xl:px-12 shrink-0">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
          {headlineStats.map((s, i) => {
            // The Players card is the only headline whose source of truth
            // includes client-side data (registered + local extras). Swap in
            // the live total so the tile matches the /players roster.
            const isPlayersCard = s.label === "Players";
            const displayValue = isPlayersCard ? String(totalPlayerCount) : s.value;
            const displayAriaLabel = isPlayersCard
              ? `${totalPlayerCount} players. Open roster.`
              : s.ariaLabel;
            return (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              whileHover={{ scale: 1.02, y: -2 }}
              transition={{ delay: 0.08 + i * 0.06, duration: 0.4, ease: "easeOut" }}
            >
              <Link
                href={s.href}
                aria-label={displayAriaLabel}
                className="h-full bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl p-3 flex items-center gap-3 hover:border-[#39FF14]/40 hover:bg-white/10 transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#39FF14]/60 group"
              >
                <div className="p-2 rounded-lg bg-black/30 border border-white/5 shrink-0">
                  <s.icon className={s.color} size={16} />
                </div>
                {/* `truncate` on the label keeps "TOTAL VOLUME" / "BIGGEST POT"
                    on a single line at narrow widths so all four cards line up
                    at the same height (was wrapping → row-1 cards taller than
                    row-2 on phones). */}
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] sm:text-xs font-bold tracking-widest uppercase text-white/40 truncate">
                    {s.label}
                  </p>
                  <p className="text-lg md:text-xl font-black text-white truncate animate-count-pop">
                    {displayValue}
                  </p>
                </div>
                <ChevronRight
                  size={14}
                  aria-hidden="true"
                  className="text-white/20 group-hover:text-[#39FF14] transition-colors shrink-0"
                />
              </Link>
            </motion.div>
            );
          })}
        </div>
      </motion.div>

      {/* Marquee with metric superlatives.
          - Desktop / fine-pointer: JS auto-scroll with click-and-drag support.
            Pauses on hover/focus, resumes on leave. Drag distance > 4px swallows
            the next click so dragging doesn't accidentally navigate.
          - Touch / coarse-pointer: native horizontal scroller — no JS pointer
            capture, so it never fights vertical page scroll.
          - Either way the row is a focusable region that responds to ←/→/Home/End. */}
      <div className="relative shrink-0">
        <div
          ref={marqueeScrollerRef}
          role="region"
          aria-label="Player superlatives — drag to scroll, or use left and right arrow keys"
          tabIndex={0}
          onKeyDown={handleMarqueeKeyDown}
          onMouseEnter={() => { isPausedRef.current = true; }}
          onMouseLeave={() => { isPausedRef.current = false; }}
          className={`dashboard-marquee-mask py-4 select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[#39FF14]/50 rounded-xl ${
            isCoarsePointer
              ? "overflow-x-auto overflow-y-hidden [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              : "overflow-hidden cursor-grab active:cursor-grabbing"
          }`}
        >
          <div
            ref={marqueeRef}
            className={`flex gap-5 w-max ${isCoarsePointer ? "px-4 md:px-6" : ""}`}
            style={{ willChange: "transform" }}
            onPointerDown={handleMarqueePointerDown}
            onPointerMove={handleMarqueePointerMove}
            onPointerUp={handleMarqueePointerUp}
            onPointerCancel={handleMarqueePointerUp}
          >
            {/* Always render the doubled list so the auto-scroll wrap point
                (subtract halfWidth) lands on a duplicate and the loop is
                visually seamless on both desktop transform and mobile
                scrollLeft. Snap-mandatory was dropped above so it doesn't
                yank the row back to a card edge while auto-scroll is creeping. */}
            {[...metrics, ...metrics].map((metric, idx) => (
              <div
                key={`${metric.id}-${idx}`}
                data-marquee-card
                role="button"
                tabIndex={0}
                aria-label={`${metric.title} — leader ${metric.player} (${metric.value}). Open ${metric.title} leaderboard.`}
                onClick={() => {
                  // If the user just dragged the row, swallow the click so
                  // navigation doesn't fire on the release.
                  if (dragRef.current?.moved) return;
                  router.push(`/leaderboards?category=${metric.categorySlug}`);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    router.push(`/leaderboards?category=${metric.categorySlug}`);
                  }
                }}
                className="w-[320px] sm:w-[340px] md:w-[400px] shrink-0 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#39FF14]/60 rounded-2xl"
              >
                <div
                  className="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-2xl border border-white/15 hover:border-white/30 hover:-translate-y-0.5 transition-all duration-300 rounded-2xl p-4 flex flex-col h-full group select-none relative overflow-hidden"
                  style={{
                    boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
                  }}
                >
                  {/* Per-metric corner glow */}
                  <div
                    className="absolute top-0 right-0 w-40 h-40 rounded-full blur-3xl pointer-events-none opacity-50 group-hover:opacity-100 transition-opacity duration-500"
                    style={{ background: `rgba(${metric.themeRgb},0.15)` }}
                  ></div>

                  {/* Title row */}
                  <div className="relative z-10 flex items-center justify-between mb-1">
                    <span className="text-white/90 font-black tracking-widest text-sm md:text-base uppercase">
                      {metric.title}
                    </span>
                    <div
                      className="p-1.5 rounded-lg transition-colors"
                      style={{ backgroundColor: `rgba(${metric.themeRgb},0.1)` }}
                    >
                      <metric.icon className={metric.themeColor} size={16} />
                    </div>
                  </div>
                  <p className="text-xs md:text-sm text-white/50 font-medium relative z-10">
                    {metric.subtext}
                  </p>

                  {/* Hero: avatar + name + value */}
                  <div className="flex items-center gap-3 mt-3 relative z-10">
                    <Link
                      href={`/profile/${encodeURIComponent(metric.player.toLowerCase().replace(/ /g, "-"))}`}
                      // Stop pointer events from reaching the marquee row (which
                      // otherwise calls setPointerCapture and steals the click)
                      // so tapping the avatar always navigates to the profile.
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`Open ${metric.player}'s profile`}
                      className="relative z-20 shrink-0 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[#39FF14]/60"
                    >
                      <PlayerAvatar
                        name={metric.player}
                        avatarUrl={avatarMap[metric.player]}
                        size={60}
                        className="rounded-full border-2 transition-colors pointer-events-none"
                      />
                    </Link>
                    <div className="min-w-0 flex-1">
                      {/* line-clamp-2 so "Alexander Smith"-length names get a
                          second line instead of vanishing mid-word. */}
                      <p className="text-base font-bold tracking-tight text-white/80 group-hover:text-white transition-colors line-clamp-2 leading-tight break-words">
                        {metric.player}
                      </p>
                      <p className={`text-xl md:text-2xl font-black drop-shadow-md ${metric.valColor} tabular-nums mt-0.5`}>
                        {metric.value}
                      </p>
                    </div>
                  </div>

                  {/* Lead + sparkline */}
                  <div className="mt-3 pt-2.5 border-t border-white/10 relative z-10 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-bold tracking-widest uppercase text-white/40 truncate">
                        {metric.lead}
                      </p>
                      <p className="text-xs text-white/60 truncate">
                        <span className="text-white/40">vs </span>
                        <span className="font-bold">{metric.runnerUp.name}</span>
                        <span className="text-white/40"> · </span>
                        <span className="font-mono">{metric.runnerUp.value}</span>
                      </p>
                    </div>
                    <Sparkline data={metric.trend} positive={metric.trendPositive} width={60} height={22} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* Bottom: Heatmap + Recent Sessions side panel.
          Recent panel surfaces from `lg` (was xl-only — invisible on iPad and
          1024-1279px laptops). Width is min 320px and grows so wide screens
          aren't capped at the old fixed 360px. */}
      <div className="md:flex-1 md:min-h-0 px-4 md:px-6 xl:px-12 pb-4 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(320px,28rem)] gap-3">
        {/* Heatmap */}
        <motion.div
          variants={sectionVariants}
          className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-3 md:p-5 flex flex-col min-h-[320px] md:min-h-0"
        >
          <div className="flex items-end justify-between mb-3 gap-3 shrink-0">
            <div>
              <h2 className="text-base md:text-lg font-black tracking-widest uppercase">
                Lifetime Profit
              </h2>
              <p className="text-sm text-white/40 mt-1">
                All sessions · {chartData.length} players
              </p>
            </div>
            <Link
              href="/leaderboards"
              className="inline-flex items-center gap-1 text-xs font-bold tracking-widest uppercase text-white/50 hover:text-[#39FF14] transition-colors"
            >
              Full Leaderboard
              <ChevronRight size={12} />
            </Link>
          </div>
          {/* On mobile the chart needs ~70px of x-axis space per player or
              names overlap — so wrap in a horizontal scroller with an explicit
              min-width below md and let users pan to see every label. From md
              up the chart stretches to fill the panel as before. The
              relative wrapper hosts a right-edge fade so users see there's
              more chart hidden off-screen. */}
          <div className="relative flex-1 min-h-0">
            <div className="h-full overflow-x-auto md:overflow-visible [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div
              className="h-full md:w-full"
              style={{
                minWidth:
                  typeof window !== "undefined" && window.innerWidth < 768
                    ? `${Math.max(chartData.length * 64, 480)}px`
                    : undefined,
              }}
            >
            {isMounted ? (
              chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%" style={{ overflow: "visible" }}>
                  <BarChart data={chartData} style={{ overflow: "visible" }} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                    <XAxis
                      dataKey="name"
                      stroke="#ffffff40"
                      tick={{ fill: "#ffffff80", fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                      interval={0}
                      dy={8}
                    />
                    <YAxis
                      stroke="#ffffff40"
                      tick={{ fill: "#ffffff80", fontSize: 13 }}
                      tickFormatter={(val) => `£${val}`}
                      axisLine={false}
                      tickLine={false}
                      dx={-8}
                      domain={[
                        0,
                        Math.ceil(Math.max(...chartData.map((d) => d.magnitude)) * 1.2),
                      ]}
                    />
                    <Tooltip
                      cursor={{ fill: "rgba(57,255,20,0.05)" }}
                      contentStyle={{
                        backgroundColor: "rgba(14,17,23,0.95)",
                        border: "1px solid rgba(255,255,255,0.15)",
                        borderRadius: "12px",
                        backdropFilter: "blur(8px)",
                        color: "#FAFAFA",
                      }}
                      labelStyle={{ color: "#FAFAFA", fontWeight: 700 }}
                      // Show the *real* signed profit; explicit ±/Win/Loss text
                      // means the tooltip doesn't lean on color alone (was
                      // green-only, unreadable for protanopia/deuteranopia).
                      formatter={(_value, _name, entry) => {
                        const n = Number((entry?.payload as { profit?: number } | undefined)?.profit ?? 0);
                        const sign = n < 0 ? "−" : "+";
                        const label = n < 0 ? "Loss" : "Profit";
                        return [
                          <span
                            key="v"
                            style={{ color: n < 0 ? "#fca5a5" : "#39FF14", fontWeight: 700 }}
                          >
                            {sign}£{Math.abs(n).toFixed(2)}
                          </span>,
                          label,
                        ];
                      }}
                    />
                    <Bar dataKey="magnitude" shape={<ChipStackShape />} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-white/40">
                  <div className="relative mb-4 opacity-30">
                    <Coins size={64} className="text-white" />
                    <TrendingUp size={24} className="absolute -bottom-2 -right-2 text-[#39FF14]" />
                  </div>
                  <p className="text-sm font-bold tracking-widest uppercase">No Session Data Yet</p>
                  <p className="text-xs text-white/30 mt-2 text-center max-w-[250px]">
                    Play your first session to see player profit rankings here.
                  </p>
                </div>
              )
            ) : (
              <div className="w-full h-full flex items-center justify-center text-white/20 font-bold">
                LOADING...
              </div>
            )}
            </div>
            </div>
            {/* Right-edge fade — mobile only, hints at horizontal scroll when
                the player list overflows the panel. */}
            <div
              aria-hidden
              className="pointer-events-none absolute top-0 right-0 h-full w-8 md:hidden bg-gradient-to-l from-[#0E1117] to-transparent"
            />
          </div>
        </motion.div>

        {/* Recent Sessions panel — stacks below the heatmap on mobile, sits
            beside it from lg up. The outer grid is grid-cols-1 lg:grid-cols-2,
            so removing the hidden class is all that's needed to surface it on
            phones. Capped at max-h on mobile so it doesn't push the page so
            far that the marquee is invisible. */}
        <motion.aside
          variants={sectionVariants}
          aria-label="Recent sessions"
          className="flex flex-col bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-4 min-h-0 max-h-[420px] lg:max-h-none"
        >
          <div className="flex items-center justify-between mb-3 shrink-0">
            <div className="flex items-center gap-3">
              <History className="text-[#39FF14]" size={18} />
              <h2 className="text-base md:text-lg font-black tracking-widest uppercase">
                Recent
              </h2>
            </div>
            <Link
              href="/games"
              className="inline-flex items-center gap-1 text-xs font-bold tracking-widest uppercase text-white/50 hover:text-[#39FF14] transition-colors"
            >
              View All
              <ChevronRight size={12} />
            </Link>
          </div>

          <div
            className="flex-1 min-h-0 overflow-auto flex flex-col gap-2"
            aria-busy={avatarsLoading}
          >
            {recentSessions.map((s) => {
              const positive = s.winner.net >= 0;
              return (
                <Link
                  key={s.id}
                  href={`/games/history/${s.id}`}
                  className="block bg-black/20 border border-white/5 hover:bg-white/[0.05] hover:border-[#39FF14]/30 rounded-xl p-3 transition-all group"
                >
                  <div className="flex items-center justify-between mb-2.5">
                    <div className="flex items-center gap-1.5 text-sm font-bold text-white/80">
                      <Calendar size={11} className="text-[#39FF14]/60" />
                      {s.date}
                    </div>
                    <span className="text-xs font-mono text-white/30">{s.duration}</span>
                  </div>

                  <div className="flex items-center gap-2.5 mb-2.5">
                    <div className="relative shrink-0">
                      <PlayerAvatar
                        name={s.winner.name}
                        avatarUrl={avatarMap[s.winner.name]}
                        size={40}
                        className="rounded-full border-2 border-yellow-400/40"
                      />
                      <Crown
                        size={12}
                        className="absolute -top-1 -right-1 text-yellow-400 drop-shadow-[0_0_4px_rgba(250,204,21,0.6)]"
                      />
                    </div>
                    {/* Headline number is the winner's final stack (£81.50)
                        not the net (£56.50) — readers expected to see what
                        they walked away with. The smaller line keeps the net
                        visible because that's still the meaningful tracking
                        figure (cash-out − buy-in). */}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-white truncate">{s.winner.name}</p>
                      <p className="text-base font-black tabular-nums text-white">
                        £{s.winner.cashOut.toFixed(2)}
                      </p>
                      <p
                        className={`text-xs font-bold tabular-nums ${
                          positive ? "text-[#39FF14]" : "text-red-400"
                        }`}
                      >
                        {positive ? "+" : ""}£{s.winner.net.toFixed(2)} profit
                      </p>
                    </div>
                    <ChevronRight
                      size={14}
                      className="text-white/20 group-hover:text-[#39FF14] transition-colors shrink-0"
                    />
                  </div>

                  <div className="flex items-center justify-between text-xs text-white/40">
                    <span className="font-mono">{s.blinds}</span>
                    <span className="flex items-center gap-2">
                      <span className="text-cyan-400 font-bold">£{s.pot.toFixed(2)}</span>
                      <span className="text-white/30">·</span>
                      <span>{s.playerCount}p</span>
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </motion.aside>
      </div>
    </motion.div>
  );
}
