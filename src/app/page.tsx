"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useIsMounted, useSessionItem } from "@/lib/use-hydration";
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
  Shield,
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
import { historicalGames } from "@/lib/historical-games";

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

const metrics: MetricCard[] = [
  {
    id: 1, title: "King of the Felt", subtext: "Most money won, all-time",
    categorySlug: "overall-leader",
    player: "Player A", value: "+£1,200", icon: Trophy, valColor: "text-[#39FF14]",
    themeColor: "text-yellow-400", themeRgb: "250,204,21",
    runnerUp: { name: "Player B", value: "+£800" }, lead: "+£400 ahead",
    trend: [200, 350, 600, 700, 950, 1200], trendPositive: true,
  },
  {
    id: 2, title: "Apex Predator", subtext: "Best win rate (sessions in profit)",
    categorySlug: "the-shark",
    player: "Player B", value: "75%", icon: Swords, valColor: "text-[#39FF14]",
    themeColor: "text-[#39FF14]", themeRgb: "57,255,20",
    runnerUp: { name: "Player G", value: "68%" }, lead: "+7 pts ahead",
    trend: [62, 65, 70, 71, 73, 75], trendPositive: true,
  },
  {
    id: 3, title: "Deep Pockets", subtext: "Most chips bought across all sessions",
    categorySlug: "the-whale",
    player: "Player C", value: "£5,000", icon: CircleDollarSign, valColor: "text-cyan-400",
    themeColor: "text-cyan-400", themeRgb: "34,211,238",
    runnerUp: { name: "Player E", value: "£4,200" }, lead: "+£800 over runner-up",
    trend: [1200, 2100, 2800, 3400, 4200, 5000], trendPositive: true,
  },
  {
    id: 4, title: "Bag of Bricks", subtext: "Worst single-session loss",
    categorySlug: "the-tank",
    player: "Player D", value: "-£800", icon: Anchor, valColor: "text-red-400",
    themeColor: "text-red-400", themeRgb: "248,113,113",
    runnerUp: { name: "Player C", value: "-£620" }, lead: "across 3 sessions",
    trend: [-100, -250, -400, -520, -700, -800], trendPositive: false,
  },
  {
    id: 5, title: "Pizza Hoover", subtext: "Most spent on snacks & takeaways",
    categorySlug: "the-vacuum",
    player: "Player E", value: "£350", icon: Pizza, valColor: "text-orange-400",
    themeColor: "text-orange-400", themeRgb: "251,146,60",
    runnerUp: { name: "Player A", value: "£280" }, lead: "≈ £8 per session",
    trend: [40, 110, 180, 230, 290, 350], trendPositive: true,
  },
  {
    id: 6, title: "Iron Bladder", subtext: "Most sessions logged, full stop",
    categorySlug: "the-grinder",
    player: "Player F", value: "42 Sessions", icon: Timer, valColor: "text-blue-400",
    themeColor: "text-blue-400", themeRgb: "96,165,250",
    runnerUp: { name: "Player A", value: "22" }, lead: "+20 over runner-up",
    trend: [12, 18, 24, 30, 36, 42], trendPositive: true,
  },
  {
    id: 7, title: "Roller Coaster", subtext: "Biggest single-session swing",
    categorySlug: "the-maniac",
    player: "Player G", value: "£1,500 Swing", icon: Zap, valColor: "text-purple-400",
    themeColor: "text-purple-400", themeRgb: "192,132,252",
    runnerUp: { name: "Player C", value: "£1,200" }, lead: "peak in last 5 games",
    trend: [200, -400, 800, -300, 1100, 1500], trendPositive: true,
  },
  {
    id: 8, title: "Stone Wall", subtext: "Tightest player (lowest VPIP)",
    categorySlug: "the-rock",
    player: "Player H", value: "12% VPIP", icon: Shield, valColor: "text-emerald-400",
    themeColor: "text-emerald-400", themeRgb: "52,211,153",
    runnerUp: { name: "Player B", value: "16%" }, lead: "vs 30% table avg",
    trend: [16, 14, 13, 13, 12, 12], trendPositive: false,
  },
];

const trueDataArray = [
  { name: "Player G", profit: 2500 },
  { name: "Player A", profit: 1200 },
  { name: "Player B", profit: 800 },
  { name: "Player E", profit: 150 },
  { name: "Player H", profit: 50 },
  { name: "Player F", profit: -100 },
  { name: "Player C", profit: -300 },
  { name: "Player D", profit: -500 },
];

const headlineStats = [
  { label: "Sessions", value: "14", icon: Activity, color: "text-[#39FF14]" },
  { label: "Total Volume", value: "£18,400", icon: Coins, color: "text-cyan-400" },
  { label: "Players", value: "8", icon: Users, color: "text-yellow-400" },
  { label: "Net Across Table", value: "+£3,800", icon: TrendingUp, color: "text-[#39FF14]" },
];

const recentSessions = historicalGames.slice(0, 4).map((g) => {
  const ranked = [...g.players]
    .map((p) => ({ ...p, net: p.cashOut - p.buyIn - p.food }))
    .sort((a, b) => b.net - a.net);
  const winner = ranked[0];
  return {
    id: g.id,
    date: g.date,
    duration: g.duration,
    blinds: g.blinds,
    pot: g.totalPot,
    playerCount: g.players.length,
    winner: { name: winner.name, net: winner.net },
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

  const chips = [];

  for (let i = 0; i < numChips; i++) {
    const chipY = baseLine - chipThickness * (i + 1);

    chips.push(
      <motion.g
        key={`${payload.name}-${i}`}
        initial={{ y: -chipY - 800, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "tween", ease: "easeIn", duration: 0.6, delay: i * 0.08 }}
      >
        {/* Curved bottom rim — extends ry below chipY+chipThickness, which
            (for chips above the bottom one) lands on top of the chip below
            and creates the visible "stacked rim" between chips. */}
        <ellipse cx={cx} cy={chipY + chipThickness} rx={rx} ry={ry} fill={darkColor} />
        {/* Cylinder side */}
        <rect x={cx - rx} y={chipY} width={rx * 2} height={chipThickness} fill={darkColor} />
        {/* Side ticks — kept strictly within the cylinder rect (no ry overflow)
            so the bottom-most chip's tick never hangs below the stack, and
            every chip's tick sits at the exact same x range as the chip
            above/below for clean vertical alignment. */}
        <rect x={cx - rx} y={chipY} width={3} height={chipThickness} fill="#ffffff" opacity={0.8} />
        <rect x={cx + rx - 3} y={chipY} width={3} height={chipThickness} fill="#ffffff" opacity={0.8} />
        <rect x={cx - 3} y={chipY} width={6} height={chipThickness} fill="#ffffff" opacity={0.8} />
        {/* Top face + dashed inner ring + dot. Per-chip so stacking still
            shows distinct rims even when only the topmost top is visible. */}
        <ellipse cx={cx} cy={chipY} rx={rx} ry={ry} fill={baseColor} />
        <ellipse cx={cx} cy={chipY} rx={rx * 0.75} ry={ry * 0.75} fill="transparent" stroke="#ffffff" strokeWidth={1.5} strokeDasharray="3 3" opacity={0.9} />
        <ellipse cx={cx} cy={chipY} rx={rx * 0.4} ry={ry * 0.4} fill={darkColor} opacity={0.3} />
      </motion.g>
    );
  }

  return <g>{chips}</g>;
};

export default function Dashboard() {
  const router = useRouter();
  const chartData = trueDataArray;
  const [avatarMap, setAvatarMap] = useState<Record<string, string>>({});
  const isMounted = useIsMounted();
  const liveGameId = useSessionItem("liveGameId");
  const currentDate = useMemo(
    () =>
      isMounted
        ? new Date().toLocaleDateString("en-GB", {
            weekday: "long",
            day: "numeric",
            month: "long",
          })
        : "",
    [isMounted],
  );

  const marqueeRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | undefined>(undefined);
  const posRef = useRef(0);
  const halfWidthRef = useRef(0);
  const isPausedRef = useRef(false);
  const dragRef = useRef<{ active: boolean; startX: number; startPos: number; lastX: number; velocity: number } | null>(null);

  useEffect(() => {
    async function fetchDashboardData() {
      try {
        const { data: playersData } = await supabase
          .from("players")
          .select("name, avatar_url");
        if (playersData) {
          const map: Record<string, string> = {};
          playersData.forEach((p) => {
            if (p.avatar_url) map[p.name] = p.avatar_url;
          });
          setAvatarMap(map);
        }
      } catch {
        // ignore
      }
    }

    fetchDashboardData();
  }, []);

  useEffect(() => {
    const el = marqueeRef.current;
    if (!el) return;

    const measure = () => {
      halfWidthRef.current = el.scrollWidth / 2;
    };

    const tick = () => {
      if (el && !dragRef.current?.active && !isPausedRef.current) {
        posRef.current -= 0.55;
        if (halfWidthRef.current > 0 && Math.abs(posRef.current) >= halfWidthRef.current) {
          posRef.current += halfWidthRef.current;
        }
        el.style.transform = `translateX(${posRef.current}px)`;
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
  }, []);

  const handleMarqueePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      active: true,
      startX: e.clientX,
      startPos: posRef.current,
      lastX: e.clientX,
      velocity: 0,
    };
  };

  const handleMarqueePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d?.active || !marqueeRef.current) return;
    const delta = e.clientX - d.startX;
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
        dragRef.current = null;
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

  return (
    <motion.div
      variants={pageVariants}
      initial="hidden"
      animate="show"
      className="flex-1 min-h-0 flex flex-col overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(57,255,20,0.08)_0%,_rgba(14,17,23,1)_60%)] text-[#FAFAFA]"
    >
      {/* Hero strip — title + date + live/start CTA */}
      <motion.div
        variants={sectionVariants}
        className="px-6 xl:px-12 pt-4 pb-3 shrink-0"
      >
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 bg-[#39FF14]/10 rounded-xl border border-[#39FF14]/20 shrink-0">
              <Activity className="text-[#39FF14]" size={22} />
            </div>
            <div className="min-w-0">
              <h1 className="text-3xl md:text-4xl font-black tracking-tight uppercase leading-none">
                Dashboard
              </h1>
              <p className="text-white/50 text-base mt-2 flex items-center gap-2 flex-wrap">
                {currentDate && (
                  <>
                    <Calendar size={14} className="text-[#39FF14]/60 shrink-0" />
                    <span>{currentDate}</span>
                    <span className="text-white/30">·</span>
                  </>
                )}
                <span>14 sessions tracked</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
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
                  Resume Live Session
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
        </div>
      </motion.div>

      {/* Headline stats */}
      <motion.div variants={sectionVariants} className="px-6 xl:px-12 shrink-0">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
          {headlineStats.map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              whileHover={{ scale: 1.02, y: -2 }}
              transition={{ delay: 0.08 + i * 0.06, duration: 0.4, ease: "easeOut" }}
              className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl p-3 flex items-center gap-3 hover:border-white/20 hover:bg-white/10 transition-all cursor-default"
            >
              <div className="p-2 rounded-lg bg-black/30 border border-white/5 shrink-0">
                <s.icon className={s.color} size={16} />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold tracking-widest uppercase text-white/40">
                  {s.label}
                </p>
                <p className="text-lg md:text-xl font-black text-white truncate animate-count-pop">
                  {s.value}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* Marquee with metric superlatives — fades out exactly at the static tile edges */}
      <div className="relative shrink-0">
        <div
          className="dashboard-marquee-mask overflow-hidden py-4 cursor-grab active:cursor-grabbing select-none"
          onMouseEnter={() => { isPausedRef.current = true; }}
          onMouseLeave={() => { isPausedRef.current = false; }}
        >
          <div
            ref={marqueeRef}
            className="flex w-max gap-5"
            style={{ willChange: "transform" }}
            onPointerDown={handleMarqueePointerDown}
            onPointerMove={handleMarqueePointerMove}
            onPointerUp={handleMarqueePointerUp}
            onPointerCancel={handleMarqueePointerUp}
          >
            {[...metrics, ...metrics].map((metric, idx) => (
              <motion.div
                key={`${metric.id}-${idx}`}
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4, ease: "easeOut", delay: idx < metrics.length ? idx * 0.06 : 0 }}
                whileHover={{ scale: 1.04, y: -3 }}
                onClick={() => {
                  if (dragRef.current && !dragRef.current.active && Math.abs(dragRef.current.startPos - posRef.current) > 5) return;
                  router.push(`/leaderboards?category=${metric.categorySlug}`);
                }}
                className="w-[360px] md:w-[400px] shrink-0 cursor-pointer"
              >
                <div
                  className="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-2xl border border-white/15 hover:border-white/30 transition-all duration-300 rounded-2xl p-4 flex flex-col h-full group select-none relative overflow-hidden"
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
                      onClick={(e) => e.stopPropagation()}
                      className="relative z-20 shrink-0"
                    >
                      <PlayerAvatar
                        name={metric.player}
                        avatarUrl={avatarMap[metric.player]}
                        size={60}
                        className="rounded-full border-2 transition-colors pointer-events-none"
                      />
                    </Link>
                    <div className="min-w-0 flex-1">
                      <p className="text-base font-bold tracking-tight text-white/80 group-hover:text-white transition-colors truncate">
                        {metric.player}
                      </p>
                      <p className={`text-xl md:text-2xl font-black drop-shadow-md ${metric.valColor} tabular-nums`}>
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
              </motion.div>
            ))}
          </div>
        </div>

      </div>

      {/* Bottom: Heatmap + Recent Sessions side panel */}
      <div className="flex-1 min-h-0 px-6 xl:px-12 pb-4 grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-3">
        {/* Heatmap */}
        <motion.div
          variants={sectionVariants}
          className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-3 md:p-5 flex flex-col min-h-0"
        >
          <div className="flex items-end justify-between mb-3 gap-3 shrink-0">
            <div>
              <h2 className="text-base md:text-lg font-black tracking-widest uppercase">
                Lifetime Net Profit
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
          <div className="flex-1 min-h-0">
            {isMounted ? (
              chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%" style={{ overflow: "visible" }}>
                  <BarChart data={chartData} style={{ overflow: "visible" }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                    <XAxis
                      dataKey="name"
                      stroke="#ffffff40"
                      tick={{ fill: "#ffffff80", fontSize: 13 }}
                      axisLine={false}
                      tickLine={false}
                      dy={8}
                    />
                    <YAxis
                      stroke="#ffffff40"
                      tick={{ fill: "#ffffff80", fontSize: 13 }}
                      tickFormatter={(val) => (val < 0 ? `-£${Math.abs(val)}` : `£${val}`)}
                      axisLine={false}
                      tickLine={false}
                      dx={-8}
                      domain={[
                        Math.floor(Math.min(0, ...chartData.map((d) => d.profit)) * 1.2),
                        Math.ceil(Math.max(0, ...chartData.map((d) => d.profit)) * 1.2),
                      ]}
                    />
                    <Tooltip
                      cursor={{ fill: "rgba(57,255,20,0.05)" }}
                      contentStyle={{
                        backgroundColor: "rgba(14,17,23,0.9)",
                        border: "1px solid rgba(255,255,255,0.1)",
                        borderRadius: "12px",
                        backdropFilter: "blur(8px)",
                      }}
                      itemStyle={{ color: "#39FF14", fontWeight: 600 }}
                      formatter={(value) => {
                        const n = Number(value);
                        return [n < 0 ? `-£${Math.abs(n)}` : `£${n}`, "Profit"];
                      }}
                    />
                    <Bar dataKey="profit" shape={<ChipStackShape />} isAnimationActive={false} />
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
        </motion.div>

        {/* Recent Sessions side panel — xl only */}
        <motion.aside
          variants={sectionVariants}
          className="hidden xl:flex flex-col bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-4 min-h-0"
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

          <div className="flex-1 min-h-0 overflow-auto flex flex-col gap-2">
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
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-white truncate">{s.winner.name}</p>
                      <p
                        className={`text-base font-black tabular-nums ${
                          positive ? "text-[#39FF14]" : "text-red-400"
                        }`}
                      >
                        {positive ? "+" : ""}£{s.winner.net}
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
                      <span className="text-cyan-400 font-bold">£{s.pot}</span>
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
