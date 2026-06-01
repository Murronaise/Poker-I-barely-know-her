import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ChevronLeft, Trophy, Calendar, Coins, Crown,
  TrendingUp, Pizza, Users, Activity, Zap,
} from "lucide-react";
import { type HistoricalGame } from "@/lib/historical-games";
import { fetchEffectiveGames } from "@/lib/game-store";
import PlayerAvatar from "@/components/PlayerAvatar";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatCurrency } from "@/lib/format";


export const dynamic = "force-dynamic";

function parseYear(input: string): number | null {
  const n = parseInt(input, 10);
  if (!Number.isFinite(n) || n < 2000 || n > 2100) return null;
  return n;
}

function yearOfDate(humanDate: string): number | null {
  const d = new Date(humanDate);
  if (!Number.isFinite(d.getTime())) return null;
  return d.getFullYear();
}

export default async function YearlyRecapPage({
  params,
}: {
  params: Promise<{ year: string }>;
}) {
  const { year: yearParam } = await params;
  const year = parseYear(yearParam);
  if (!year) notFound();

  const sb = await createSupabaseServerClient();
  const allGames = await fetchEffectiveGames(sb);
  const games = allGames.filter((g) => yearOfDate(g.date) === year);
  if (games.length === 0) notFound();

  // Avatars for the leaders we end up surfacing.
  const { data: playerRows } = await sb
    .from("players")
    .select("name, avatar_url");
  const avatarMap: Record<string, string> = {};
  (playerRows ?? []).forEach((p: { name: string; avatar_url?: string | null }) => {
    if (p.avatar_url) avatarMap[p.name] = p.avatar_url;
  });

  // ---- Derived stats ------------------------------------------------------
  const totalGames = games.length;
  const totalPot = games.reduce((sum, g) => sum + g.totalPot, 0);
  const totalFood = games.reduce(
    (sum, g) => sum + g.players.reduce((s, p) => s + p.food, 0),
    0,
  );
  const uniquePlayers = new Set(games.flatMap((g) => g.players.map((p) => p.name))).size;

  // Per-player aggregates for the year.
  type Agg = {
    name: string;
    sessions: number;
    netLifetime: number;
    food: number;
    bestSingle: number;
    bestSingleDate: string;
    worstSingle: number;
    worstSingleDate: string;
  };
  const aggMap = new Map<string, Agg>();
  for (const g of games) {
    for (const p of g.players) {
      const net = p.cashOut - p.buyIn;
      let a = aggMap.get(p.name);
      if (!a) {
        a = {
          name: p.name,
          sessions: 0,
          netLifetime: 0,
          food: 0,
          bestSingle: -Infinity,
          bestSingleDate: "",
          worstSingle: Infinity,
          worstSingleDate: "",
        };
        aggMap.set(p.name, a);
      }
      a.sessions += 1;
      a.netLifetime += net;
      a.food += p.food;
      if (net > a.bestSingle) { a.bestSingle = net; a.bestSingleDate = g.date; }
      if (net < a.worstSingle) { a.worstSingle = net; a.worstSingleDate = g.date; }
    }
  }
  const aggs = [...aggMap.values()];

  const moneyPrinter = [...aggs].sort((a, b) => b.netLifetime - a.netLifetime)[0];
  const biggestLoser = [...aggs].sort((a, b) => a.netLifetime - b.netLifetime)[0];
  const ironStomach = [...aggs].sort((a, b) => b.sessions - a.sessions)[0];
  const foodie = [...aggs].sort((a, b) => b.food - a.food)[0];

  // Single-night superlatives.
  let biggestPotGame = games[0];
  let biggestSingleWin: { player: string; net: number; date: string } | null = null;
  let biggestSingleLoss: { player: string; net: number; date: string } | null = null;
  for (const g of games) {
    if (g.totalPot > biggestPotGame.totalPot) biggestPotGame = g;
    for (const p of g.players) {
      const net = p.cashOut - p.buyIn;
      if (!biggestSingleWin || net > biggestSingleWin.net) {
        biggestSingleWin = { player: p.name, net, date: g.date };
      }
      if (!biggestSingleLoss || net < biggestSingleLoss.net) {
        biggestSingleLoss = { player: p.name, net, date: g.date };
      }
    }
  }

  const formatPence = (n: number) => formatCurrency(n, true);

  // ---- Render -------------------------------------------------------------
  return (
    <main className="flex-1 md:min-h-0 md:overflow-auto bg-[radial-gradient(circle_at_top,_rgba(57,255,20,0.05)_0%,_rgba(14,17,23,1)_60%)] text-[#FAFAFA] px-4 md:px-6 xl:px-12 py-5">
      <div className="max-w-4xl mx-auto">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-base text-white/50 hover:text-[#39FF14] font-semibold transition-colors mb-6"
        >
          <ChevronLeft size={18} />
          <span>Back to Dashboard</span>
        </Link>
 
        <div className="flex items-center gap-3 mb-8">
          <div className="p-2.5 bg-yellow-400/10 rounded-xl border border-yellow-400/30">
            <Trophy className="text-yellow-400" size={22} />
          </div>
          <div>
            <h1 className="text-2xl md:text-4xl font-black tracking-tight uppercase leading-none">
              {year} in Poker
            </h1>
            <p className="text-white/50 text-base mt-2">
              {totalGames} session{totalGames === 1 ? "" : "s"} · {uniquePlayers} players · {formatCurrency(totalPot)} of chips moved
            </p>
          </div>
        </div>
 
        {/* Big number cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3 mb-6">
          {[
            { label: "Sessions", value: String(totalGames), icon: Activity, color: "text-[#39FF14]" },
            { label: "Pot moved", value: formatCurrency(totalPot), icon: Coins, color: "text-cyan-400" },
            { label: "Food eaten", value: formatCurrency(totalFood), icon: Pizza, color: "text-orange-400" },
            { label: "Players", value: String(uniquePlayers), icon: Users, color: "text-yellow-400" },
          ].map((s) => (
            <div
              key={s.label}
              className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl p-3 flex items-center gap-3"
            >
              <div className="p-2 rounded-lg bg-black/30 border border-white/5 shrink-0">
                <s.icon className={s.color} size={16} />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] sm:text-xs font-bold tracking-widest uppercase text-white/40 truncate">
                  {s.label}
                </p>
                <p className="text-lg md:text-xl font-black text-white truncate">{s.value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Player-of-the-year style cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
          <RecapCard
            title="Money Printer"
            subtitle={`Net ${formatPence(moneyPrinter.netLifetime)}`}
            playerName={moneyPrinter.name}
            avatarUrl={avatarMap[moneyPrinter.name]}
            accent="from-[#39FF14]/30 to-cyan-400/20 border-[#39FF14]/40"
            icon={<Crown className="text-[#39FF14]" size={18} />}
          />
          <RecapCard
            title="The Pit"
            subtitle={`Net ${formatPence(biggestLoser.netLifetime)}`}
            playerName={biggestLoser.name}
            avatarUrl={avatarMap[biggestLoser.name]}
            accent="from-red-500/30 to-orange-400/20 border-red-400/40"
            icon={<TrendingUp className="text-red-400 rotate-180" size={18} />}
          />
          <RecapCard
            title="Part of the Furniture"
            subtitle={`${ironStomach.sessions} sessions`}
            playerName={ironStomach.name}
            avatarUrl={avatarMap[ironStomach.name]}
            accent="from-blue-500/30 to-cyan-400/20 border-blue-400/40"
            icon={<Calendar className="text-blue-400" size={18} />}
          />
          <RecapCard
            title="Food Gremlin"
            subtitle={`${formatCurrency(foodie.food)} eaten`}
            playerName={foodie.name}
            avatarUrl={avatarMap[foodie.name]}
            accent="from-orange-500/30 to-yellow-400/20 border-orange-400/40"
            icon={<Pizza className="text-orange-400" size={18} />}
          />
        </div>

        {/* Single-night peaks */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          {biggestSingleWin && (
            <PeakCard
              label="Biggest Single Win"
              detail={`${biggestSingleWin.player} · ${biggestSingleWin.date}`}
              value={formatPence(biggestSingleWin.net)}
              accent="text-[#39FF14]"
              icon={<Zap className="text-[#39FF14]" size={14} />}
            />
          )}
          {biggestSingleLoss && (
            <PeakCard
              label="Biggest Single Loss"
              detail={`${biggestSingleLoss.player} · ${biggestSingleLoss.date}`}
              value={formatPence(biggestSingleLoss.net)}
              accent="text-red-400"
              icon={<Zap className="text-red-400" size={14} />}
            />
          )}
          <PeakCard
            label="Biggest Pot"
            detail={biggestPotGame.date}
            value={formatCurrency(biggestPotGame.totalPot)}
            accent="text-cyan-400"
            icon={<Coins className="text-cyan-400" size={14} />}
          />
        </div>

        {/* Full table — all players, sortable by net for the year */}
        <section className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden">
          <header className="px-4 py-3 border-b border-white/10">
            <h2 className="text-xs font-black tracking-widest uppercase text-white/70">
              Year-end leaderboard
            </h2>
          </header>
          <div className="divide-y divide-white/5">
            {[...aggs]
              .sort((a, b) => b.netLifetime - a.netLifetime)
              .map((a, i) => (
                <Link
                  key={a.name}
                  href={`/profile/${encodeURIComponent(a.name.toLowerCase().replace(/ /g, "-"))}`}
                  className="grid grid-cols-12 gap-3 px-4 py-3 items-center hover:bg-white/5 transition-colors"
                >
                  <div className="col-span-1 text-center font-black text-white/40 tabular-nums">
                    {i === 0 ? <Crown size={14} className="text-yellow-400 inline" /> : `#${i + 1}`}
                  </div>
                  <div className="col-span-6 sm:col-span-5 flex items-center gap-3 min-w-0">
                    <PlayerAvatar
                      name={a.name}
                      avatarUrl={avatarMap[a.name]}
                      size={36}
                      className="rounded-full border border-white/10 shrink-0"
                    />
                    <span className="font-bold text-sm md:text-base truncate">{a.name}</span>
                  </div>
                  <div className="col-span-2 text-right text-xs text-white/40 tabular-nums">
                    {a.sessions}p
                  </div>
                  <div className="hidden sm:block col-span-1 text-right text-xs text-orange-400/70 tabular-nums">
                    {formatCurrency(a.food)}
                  </div>
                  <div
                    className={`col-span-3 text-right font-black text-base tabular-nums ${
                      a.netLifetime >= 0 ? "text-[#39FF14]" : "text-red-400"
                    }`}
                  >
                    {formatPence(a.netLifetime)}
                  </div>
                </Link>
              ))}
          </div>
        </section>
      </div>
    </main>
  );
}

function RecapCard({
  title, subtitle, playerName, avatarUrl, accent, icon,
}: {
  title: string;
  subtitle: string;
  playerName: string;
  avatarUrl?: string;
  accent: string;
  icon: React.ReactNode;
}) {
  return (
    <Link
      href={`/profile/${encodeURIComponent(playerName.toLowerCase().replace(/ /g, "-"))}`}
      className={`group rounded-2xl border bg-gradient-to-br ${accent} backdrop-blur-xl p-4 flex items-center gap-4 transition-transform hover:-translate-y-0.5`}
    >
      <PlayerAvatar
        name={playerName}
        avatarUrl={avatarUrl}
        size={64}
        className="rounded-full border-2 border-white/10 shrink-0"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 mb-1">
          {icon}
          <p className="text-[10px] font-black tracking-widest uppercase text-white/70 truncate">
            {title}
          </p>
        </div>
        <p className="text-lg md:text-xl font-black text-white truncate group-hover:text-white">
          {playerName}
        </p>
        <p className="text-xs text-white/60 tabular-nums">{subtitle}</p>
      </div>
    </Link>
  );
}

function PeakCard({
  label, detail, value, accent, icon,
}: {
  label: string;
  detail: string;
  value: string;
  accent: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl p-3">
      <div className="flex items-center gap-1.5 mb-1.5">
        {icon}
        <p className="text-[10px] font-black tracking-widest uppercase text-white/40 truncate">
          {label}
        </p>
      </div>
      <p className={`text-xl font-black tabular-nums ${accent}`}>{value}</p>
      <p className="text-xs text-white/50 truncate mt-0.5">{detail}</p>
    </div>
  );
}
