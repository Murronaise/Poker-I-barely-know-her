"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  ChevronLeft,
  Coins,
  TrendingUp,
  TrendingDown,
  Activity,
  Crown,
  ChevronRight,
  Calendar,
  Wallet,
  Pizza,
  Users,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { useIsMounted } from "@/lib/use-hydration";
import { historicalGames } from "@/lib/historical-games";

export default function StatsPage() {
  const isMounted = useIsMounted();

  const games = [...historicalGames].sort((a, b) => a.id.localeCompare(b.id));
  const sessionCount = games.length;
  const totalVolume = games.reduce((sum, g) => sum + g.totalPot, 0);
  const totalBuyIns = games.reduce(
    (sum, g) => sum + g.players.reduce((s, p) => s + p.buyIn, 0),
    0,
  );
  const totalFood = games.reduce(
    (sum, g) => sum + g.players.reduce((s, p) => s + p.food, 0),
    0,
  );
  const avgPot = sessionCount > 0 ? totalVolume / sessionCount : 0;
  const biggestGame = games.reduce(
    (best, g) => (g.totalPot > (best?.totalPot ?? 0) ? g : best),
    games[0],
  );
  const smallestGame = games.reduce(
    (worst, g) => (g.totalPot < (worst?.totalPot ?? Infinity) ? g : worst),
    games[0],
  );

  // Volume per player (sum of buy-ins across every session they joined).
  const playerVolumeMap: Record<string, number> = {};
  games.forEach((g) =>
    g.players.forEach((p) => {
      playerVolumeMap[p.name] = (playerVolumeMap[p.name] ?? 0) + p.buyIn;
    }),
  );
  const playerVolume = Object.entries(playerVolumeMap)
    .map(([name, buyIn]) => ({ name, buyIn }))
    .sort((a, b) => b.buyIn - a.buyIn);

  // Per-session bar chart data (chronological).
  const chartData = games.map((g) => ({
    label: g.date.replace(/, \d{4}$/, ""),
    pot: g.totalPot,
    id: g.id,
  }));

  const headline: { label: string; value: string; icon: typeof Coins; color: string }[] = [
    {
      label: "Total Volume",
      value: `£${totalVolume.toLocaleString()}`,
      icon: Coins,
      color: "text-cyan-400",
    },
    {
      label: "Avg Pot",
      value: `£${avgPot.toFixed(2)}`,
      icon: Activity,
      color: "text-[#39FF14]",
    },
    {
      label: "Total Buy-ins",
      value: `£${totalBuyIns.toLocaleString()}`,
      icon: Wallet,
      color: "text-yellow-400",
    },
    {
      label: "Food Spend",
      value: `£${totalFood.toFixed(2)}`,
      icon: Pizza,
      color: "text-orange-400",
    },
  ];

  return (
    <motion.main
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="flex-1 md:min-h-0 md:overflow-auto bg-[radial-gradient(circle_at_top,_rgba(57,255,20,0.05)_0%,_rgba(14,17,23,1)_60%)] text-[#FAFAFA] px-4 md:px-6 xl:px-12 py-5"
    >
      <div className="max-w-7xl mx-auto flex flex-col gap-4">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-base text-white/50 hover:text-[#39FF14] font-semibold transition-colors w-fit"
        >
          <ChevronLeft size={18} aria-hidden="true" />
          <span>Back to Dashboard</span>
        </Link>

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-cyan-400/10 rounded-xl border border-cyan-400/20 shrink-0">
            <Coins className="text-cyan-400" size={22} aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-2xl md:text-4xl font-black tracking-tight uppercase leading-none">
              Volume Breakdown
            </h1>
            <p className="text-white/50 text-base mt-2">
              How much money has flowed across {sessionCount} sessions.
            </p>
          </div>
        </div>

        {/* Headline metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
          {headline.map((m) => (
            <div
              key={m.label}
              className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl p-3 flex items-center gap-3"
            >
              <div className="p-2 rounded-lg bg-black/30 border border-white/5 shrink-0">
                <m.icon className={m.color} size={16} aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold tracking-widest uppercase text-white/40">
                  {m.label}
                </p>
                <p className="text-lg md:text-xl font-black text-white truncate tabular-nums">
                  {m.value}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Pot per session bar chart */}
        <section
          aria-label="Pot size per session"
          className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-4 md:p-5"
        >
          <div className="flex items-end justify-between mb-3 gap-3">
            <div>
              <h2 className="text-base md:text-lg font-black tracking-widest uppercase">
                Pot Size Per Session
              </h2>
              <p className="text-sm text-white/40 mt-1">
                Click a bar to open that session.
              </p>
            </div>
            <Link
              href="/games"
              className="inline-flex items-center gap-1 text-xs font-bold tracking-widest uppercase text-white/50 hover:text-[#39FF14] transition-colors"
            >
              All sessions
              <ChevronRight size={12} aria-hidden="true" />
            </Link>
          </div>
          <div className="h-[260px]">
            {isMounted ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 12, right: 16, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                  <XAxis
                    dataKey="label"
                    stroke="#ffffff40"
                    tick={{ fill: "#ffffff80", fontSize: 13 }}
                    axisLine={false}
                    tickLine={false}
                    dy={8}
                  />
                  <YAxis
                    stroke="#ffffff40"
                    tick={{ fill: "#ffffff80", fontSize: 13 }}
                    tickFormatter={(val) => `£${val}`}
                    axisLine={false}
                    tickLine={false}
                    dx={-6}
                  />
                  <Tooltip
                    cursor={{ fill: "rgba(34,211,238,0.08)" }}
                    contentStyle={{
                      backgroundColor: "rgba(14,17,23,0.95)",
                      border: "1px solid rgba(255,255,255,0.15)",
                      borderRadius: "12px",
                      backdropFilter: "blur(8px)",
                      color: "#FAFAFA",
                    }}
                    labelStyle={{ color: "#FAFAFA", fontWeight: 700 }}
                    formatter={(value) => [`£${Number(value).toLocaleString()}`, "Pot"]}
                  />
                  <Bar dataKey="pot" radius={[6, 6, 0, 0]}>
                    {chartData.map((entry) => (
                      <Cell
                        key={entry.id}
                        fill={
                          entry.id === biggestGame.id
                            ? "#39FF14"
                            : "rgba(34,211,238,0.7)"
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-white/20 font-bold">
                LOADING...
              </div>
            )}
          </div>
        </section>

        {/* Highlights row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Link
            href={`/games/history/${biggestGame.id}`}
            className="bg-white/5 backdrop-blur-xl border border-white/10 hover:border-[#39FF14]/40 rounded-2xl p-5 flex items-center gap-4 group transition-all"
          >
            <div className="p-3 rounded-xl bg-[#39FF14]/10 border border-[#39FF14]/20 shrink-0">
              <Crown className="text-[#39FF14]" size={22} aria-hidden="true" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold tracking-widest uppercase text-white/40">
                Biggest Pot
              </p>
              <p className="text-2xl font-black text-[#39FF14] tabular-nums">
                £{biggestGame.totalPot.toLocaleString()}
              </p>
              <p className="text-sm text-white/50 flex items-center gap-1 mt-0.5">
                <Calendar size={12} className="text-[#39FF14]/60" aria-hidden="true" />
                {biggestGame.date} · {biggestGame.players.length}p
              </p>
            </div>
            <ChevronRight
              size={18}
              className="text-white/20 group-hover:text-[#39FF14] transition-colors shrink-0"
              aria-hidden="true"
            />
          </Link>

          <Link
            href={`/games/history/${smallestGame.id}`}
            className="bg-white/5 backdrop-blur-xl border border-white/10 hover:border-white/30 rounded-2xl p-5 flex items-center gap-4 group transition-all"
          >
            <div className="p-3 rounded-xl bg-white/5 border border-white/10 shrink-0">
              <TrendingDown className="text-white/60" size={22} aria-hidden="true" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold tracking-widest uppercase text-white/40">
                Smallest Pot
              </p>
              <p className="text-2xl font-black text-white/80 tabular-nums">
                £{smallestGame.totalPot.toLocaleString()}
              </p>
              <p className="text-sm text-white/50 flex items-center gap-1 mt-0.5">
                <Calendar size={12} className="text-white/40" aria-hidden="true" />
                {smallestGame.date} · {smallestGame.players.length}p
              </p>
            </div>
            <ChevronRight
              size={18}
              className="text-white/20 group-hover:text-white/60 transition-colors shrink-0"
              aria-hidden="true"
            />
          </Link>
        </div>

        {/* Volume per player */}
        <section
          aria-label="Volume per player"
          className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl"
        >
          <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-white/10">
            <div className="flex items-center gap-3">
              <Users className="text-yellow-400" size={18} aria-hidden="true" />
              <h2 className="text-base md:text-lg font-black tracking-widest uppercase">
                Volume by Player
              </h2>
            </div>
            <span className="text-xs text-white/30 font-mono uppercase tracking-widest">
              Lifetime buy-ins
            </span>
          </div>
          <ul className="divide-y divide-white/5">
            {playerVolume.map((p) => {
              const pct =
                totalBuyIns > 0 ? Math.round((p.buyIn / totalBuyIns) * 100) : 0;
              return (
                <li key={p.name}>
                  <Link
                    href={`/profile/${encodeURIComponent(p.name.toLowerCase().replace(/ /g, "-"))}`}
                    className="grid grid-cols-[1fr_auto_auto] items-center gap-4 px-5 py-3 hover:bg-white/5 transition-colors min-h-[56px] group"
                  >
                    <div className="min-w-0">
                      <p className="font-bold text-base text-white/90 truncate group-hover:text-[#39FF14] transition-colors">
                        {p.name}
                      </p>
                      <div className="mt-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-[#39FF14] to-cyan-400 rounded-full"
                          style={{ width: `${Math.min(100, Math.max(4, pct))}%` }}
                        />
                      </div>
                    </div>
                    <span className="font-black text-base text-cyan-400 tabular-nums">
                      £{p.buyIn.toLocaleString()}
                    </span>
                    <span className="text-xs font-bold text-white/40 tabular-nums w-10 text-right">
                      {pct}%
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Footer hint */}
        <div className="flex items-center gap-2 text-xs text-white/30 font-bold tracking-widest uppercase">
          <TrendingUp size={12} className="text-[#39FF14]/60" aria-hidden="true" />
          Volume = sum of pot sizes across {sessionCount} sessions.
        </div>
      </div>
    </motion.main>
  );
}
