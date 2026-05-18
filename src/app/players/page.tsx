"use client";

import Link from "next/link";
import {
  Users,
  TrendingUp,
  TrendingDown,
  Search,
  ChevronRight,
  ArrowUpDown,
  X,
  BadgeCheck,
} from "lucide-react";
import { motion } from "framer-motion";
import PlayerAvatar from "@/components/PlayerAvatar";
import Sparkline from "@/components/Sparkline";
import { supabase } from "@/lib/supabase";
import { useEffect, useMemo, useState } from "react";
import { getStoredPlayers, removeStoredPlayer } from "@/lib/local-store";
import { historicalGames } from "@/lib/historical-games";
import { loadRegisteredPlayers, isRegistered, type RegisteredPlayerMap } from "@/lib/registered-players";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type PlayerRow = {
  name: string;
  profit: number;
  winRate: number;
  sessions: number;
  lastPlayed: string;
  trend: number[];
  avatarUrl?: string | null;
  /** True if this player only exists in localStorage (not in any historical
   *  game). Local-only players can be removed; seed players cannot. */
  isLocal?: boolean;
};

// Derive the roster + per-player stats from real game history. Means the
// leaderboard, profile chart, and roster all stay in sync as new sessions
// land in historical-games.ts.
function computeSeedPlayers(): PlayerRow[] {
  const byName = new Map<string, { date: string; net: number }[]>();
  // historicalGames is stored most-recent-first; reverse so we walk
  // chronologically for the running-net trend.
  [...historicalGames].reverse().forEach((g) => {
    g.players.forEach((p) => {
      // Poker net only — food is handled via the food settlement, never
      // baked into a player's headline profit.
      const net = p.cashOut - p.buyIn;
      if (!byName.has(p.name)) byName.set(p.name, []);
      byName.get(p.name)!.push({ date: g.date, net });
    });
  });

  return [...byName.entries()].map(([name, sessions]) => {
    const profit = sessions.reduce((sum, s) => sum + s.net, 0);
    const wins = sessions.filter((s) => s.net >= 0).length;
    const winRate = Math.round((wins / sessions.length) * 100);
    // Running cumulative net — drives the sparkline trend.
    const trend = sessions.reduce<number[]>((acc, s) => {
      const last = acc.length > 0 ? acc[acc.length - 1] : 0;
      acc.push(Number((last + s.net).toFixed(2)));
      return acc;
    }, []);
    // Pad to 6 points so every sparkline has the same shape.
    while (trend.length < 6) trend.unshift(0);
    return {
      name,
      profit: Number(profit.toFixed(2)),
      winRate,
      sessions: sessions.length,
      lastPlayed: sessions[sessions.length - 1].date,
      trend,
    };
  });
}

type SortKey = "name" | "profit" | "winRate" | "sessions";

const sortOptions: { key: SortKey; label: string }[] = [
  { key: "name", label: "A → Z" },
  { key: "profit", label: "Profit" },
  { key: "winRate", label: "Win %" },
  { key: "sessions", label: "Sessions" },
];

const formatProfit = (p: number) =>
  p >= 0 ? `+£${p.toLocaleString()}` : `-£${Math.abs(p).toLocaleString()}`;

function computeLocalPlayers(seed: PlayerRow[]): { rows: PlayerRow[]; avatarMap: Record<string, string> } {
  if (typeof window === "undefined") return { rows: [], avatarMap: {} };
  const stored = getStoredPlayers();
  const seedNames = new Set(seed.map((p) => p.name.toLowerCase()));
  const rows: PlayerRow[] = stored
    .filter((p) => !seedNames.has(p.name.toLowerCase()))
    .map((p) => ({
      name: p.name,
      profit: 0,
      winRate: 0,
      sessions: 0,
      lastPlayed: "Never",
      trend: [0, 0, 0, 0, 0, 0],
      avatarUrl: p.avatarUrl ?? null,
      isLocal: true,
    }));
  const avatarMap: Record<string, string> = {};
  stored.forEach((p) => {
    if (p.avatarUrl) avatarMap[p.name] = p.avatarUrl;
  });
  return { rows, avatarMap };
}

// Computed once at module load — `historicalGames` is a static import so
// these never change without a deploy.
const seedPlayers: PlayerRow[] = computeSeedPlayers();

export default function PlayersIndexPage() {
  const initialLocal = useMemo(() => computeLocalPlayers(seedPlayers), []);
  const [extraPlayers, setExtraPlayers] = useState<PlayerRow[]>(initialLocal.rows);
  const [avatarMap, setAvatarMap] = useState<Record<string, string>>(initialLocal.avatarMap);

  // Remove a locally-stored player (Test/Another etc). Only available for
  // rows with isLocal === true; seed players from historical games can't be
  // deleted from the UI.
  const handleRemoveLocalPlayer = (name: string) => {
    if (!confirm(`Remove ${name} from your local roster? Their stored avatar will also be cleared.`)) return;
    removeStoredPlayer(name);
    setExtraPlayers((prev) => prev.filter((p) => p.name !== name));
    setAvatarMap((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
  };
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [isLoading, setIsLoading] = useState(true);
  const [registered, setRegistered] = useState<RegisteredPlayerMap>(new Map());

  // Pull the registered (signed-up) player names so we can flag verified
  // accounts on the roster.
  useEffect(() => {
    let cancelled = false;
    loadRegisteredPlayers(createSupabaseBrowserClient()).then((map) => {
      if (!cancelled) setRegistered(map);
    });
    return () => { cancelled = true; };
  }, []);

  // Pull avatars from Supabase (best-effort) and merge with local ones
  useEffect(() => {
    async function fetchAvatars() {
      try {
        const { data } = await supabase.from("players").select("name, avatar_url");
        if (data) {
          setAvatarMap((prev) => {
            const next = { ...prev };
            data.forEach((p) => {
              if (p.avatar_url) next[p.name] = p.avatar_url;
            });
            return next;
          });
        }
      } catch {
        // ignore
      } finally {
        setIsLoading(false);
      }
    }
    fetchAvatars();
  }, []);

  // Synthesize a row for any signed-up account whose player_name isn't already
  // covered by historical games or the local roster. Without this, a brand-new
  // signup is invisible on /players until they actually play a session.
  const registeredOnly = useMemo<PlayerRow[]>(() => {
    const known = new Set<string>([
      ...seedPlayers.map((p) => p.name.toLowerCase()),
      ...extraPlayers.map((p) => p.name.toLowerCase()),
    ]);
    return [...registered.entries()]
      .filter(([lower]) => !known.has(lower))
      .map(([, displayName]) => ({
        name: displayName,
        profit: 0,
        winRate: 0,
        sessions: 0,
        lastPlayed: "Never",
        trend: [0, 0, 0, 0, 0, 0],
      }));
  }, [registered, extraPlayers]);

  const allPlayers = useMemo(
    () => [...seedPlayers, ...extraPlayers, ...registeredOnly],
    [extraPlayers, registeredOnly],
  );

  const visiblePlayers = useMemo(() => {
    const filtered = allPlayers.filter((p) =>
      p.name.toLowerCase().includes(query.trim().toLowerCase())
    );
    const sorted = [...filtered].sort((a, b) => {
      switch (sortKey) {
        case "profit":
          return b.profit - a.profit;
        case "winRate":
          return b.winRate - a.winRate;
        case "sessions":
          return b.sessions - a.sessions;
        case "name":
          return a.name.localeCompare(b.name);
      }
    });
    return sorted;
  }, [allPlayers, query, sortKey]);

  return (
    <motion.main
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="flex-1 flex flex-col md:min-h-0 md:overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(57,255,20,0.05)_0%,_rgba(14,17,23,1)_60%)] text-[#FAFAFA] px-4 md:px-6 xl:px-12 py-5"
    >
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-5 gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-[#39FF14]/10 rounded-xl border border-[#39FF14]/20 shrink-0">
            <Users className="text-[#39FF14]" size={22} />
          </div>
          <div>
            <h1 className="text-2xl md:text-4xl font-black tracking-tight uppercase leading-none">
              Player Roster
            </h1>
            <p className="text-white/50 text-base mt-2">All tracked players and their lifetime stats.</p>
          </div>
        </div>

        <div className="flex flex-col md:flex-row w-full md:w-auto gap-3">
          <div className="w-full md:w-72 relative">
            <Search
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40"
              size={16}
            />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search players..."
              className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 pl-10 pr-4 text-base text-white focus:outline-none focus:border-[#39FF14] focus:ring-1 focus:ring-[#39FF14] transition-all"
            />
          </div>

          <Link href="/players/new" className="w-full md:w-auto">
            <button className="w-full md:w-auto relative group overflow-hidden rounded-xl p-[1px]">
              <span className="absolute inset-0 bg-gradient-to-r from-[#39FF14] to-cyan-400 rounded-xl opacity-70 group-hover:opacity-100 transition-opacity blur-sm"></span>
              <div className="relative bg-black/50 backdrop-blur-xl px-5 py-2.5 rounded-xl flex items-center justify-center gap-2 border border-white/10 group-hover:border-[#39FF14]/50 transition-colors whitespace-nowrap">
                <span className="font-bold tracking-wide text-white group-hover:text-[#39FF14] transition-colors uppercase text-base">
                  Add Player
                </span>
              </div>
            </button>
          </Link>
        </div>
      </div>

      <div className="md:flex-1 md:min-h-0 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl flex flex-col md:overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-white/10 shrink-0 flex-wrap">
          <div className="flex items-center gap-3">
            <Users className="text-[#39FF14]" size={18} />
            <h2 className="text-base md:text-lg font-black tracking-widest uppercase">All Players</h2>
            <span className="text-xs font-bold tracking-widest uppercase text-white/40 px-2 py-0.5 rounded-full bg-white/5 border border-white/10">
              {visiblePlayers.length}
            </span>
          </div>

          <div className="flex items-center gap-1 bg-black/30 border border-white/10 rounded-lg p-1">
            <ArrowUpDown size={12} className="text-white/30 ml-1.5 mr-0.5" />
            {sortOptions.map((opt) => (
              <button
                key={opt.key}
                onClick={() => setSortKey(opt.key)}
                className={`text-xs md:text-sm font-bold tracking-widest uppercase px-2 md:px-2.5 py-1 rounded-md transition-colors ${
                  sortKey === opt.key
                    ? "bg-[#39FF14]/15 text-[#39FF14]"
                    : "text-white/50 hover:text-white"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="md:flex-1 md:min-h-0 md:overflow-auto p-3 md:p-4">
          {isLoading ? (
            <div className="h-full flex flex-col items-center justify-center py-10">
              <div className="relative w-16 h-16 mb-4">
                <div className="absolute inset-0 rounded-full border-4 border-white/5"></div>
                <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-[#39FF14] animate-spin"></div>
                <div className="absolute inset-2 rounded-full bg-[#39FF14]/10 animate-pulse-glow"></div>
              </div>
              <p className="text-[#39FF14] font-black tracking-[0.3em] uppercase text-xs animate-pulse">
                Shuffling the deck
              </p>
            </div>
          ) : visiblePlayers.length === 0 ? (
            <div className="h-full flex items-center justify-center text-white/30">
              <p className="text-base font-bold uppercase tracking-widest">
                No players match &ldquo;{query}&rdquo;
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
              {visiblePlayers.map((player) => {
                const isPositive = player.profit >= 0;
                return (
                  <Link
                    key={player.name}
                    href={`/profile/${encodeURIComponent(player.name.toLowerCase().replace(/ /g, "-"))}`}
                  >
                    <div className="relative group bg-black/20 hover:bg-[#39FF14]/[0.07] border border-white/5 hover:border-[#39FF14]/30 rounded-xl p-4 transition-all cursor-pointer h-full flex gap-4 items-start">
                      {/* Remove button — only for local-only players (Test
                          accounts etc). Stops propagation so it doesn't
                          navigate into the profile page. */}
                      {player.isLocal && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleRemoveLocalPlayer(player.name);
                          }}
                          className="absolute top-2 right-2 z-10 w-7 h-7 rounded-full bg-black/40 hover:bg-red-500/30 border border-white/10 hover:border-red-400/60 text-white/40 hover:text-red-400 flex items-center justify-center transition-colors"
                          title={`Remove ${player.name} from local roster`}
                          aria-label={`Remove ${player.name}`}
                        >
                          <X size={13} />
                        </button>
                      )}
                      {/* Larger avatar — easy to recognize */}
                      <PlayerAvatar
                        name={player.name}
                        avatarUrl={avatarMap[player.name] ?? player.avatarUrl ?? undefined}
                        size={100}
                        className="rounded-full border-2 border-white/10 group-hover:border-[#39FF14]/50 transition-colors shrink-0"
                      />

                      <div className="flex-1 min-w-0 flex flex-col gap-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <h3 className="text-lg font-bold text-white/90 group-hover:text-white transition-colors line-clamp-2 break-words">
                                {player.name}
                              </h3>
                              {isRegistered(registered, player.name) && (
                                <BadgeCheck
                                  size={14}
                                  className="text-[#39FF14] shrink-0"
                                  aria-label="Verified — claimed by a registered account"
                                />
                              )}
                            </div>
                            <p className="text-sm text-white/40 truncate">
                              {player.lastPlayed}
                            </p>
                          </div>
                          <ChevronRight
                            size={18}
                            className="text-white/20 group-hover:text-[#39FF14] transition-colors shrink-0 mt-0.5"
                          />
                        </div>

                        <div className="flex items-end justify-between gap-2">
                          <div>
                            <p className="text-xs text-white/40 uppercase font-bold tracking-widest mb-0.5">
                              Profit
                            </p>
                            <div className="flex items-center gap-1.5">
                              {isPositive ? (
                                <TrendingUp size={12} className="text-[#39FF14]" />
                              ) : (
                                <TrendingDown size={12} className="text-red-400" />
                              )}
                              <span
                                className={`font-black text-lg ${
                                  isPositive ? "text-[#39FF14]" : "text-red-400"
                                }`}
                              >
                                {formatProfit(player.profit)}
                              </span>
                            </div>
                          </div>
                          <Sparkline
                            data={player.trend}
                            positive={isPositive}
                            width={70}
                            height={24}
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/5">
                          <div>
                            <p className="text-xs text-white/40 uppercase font-bold tracking-widest">
                              Win %
                            </p>
                            <p className="text-base font-bold text-white/80">{player.winRate}%</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-white/40 uppercase font-bold tracking-widest">
                              Sessions
                            </p>
                            <p className="text-base font-bold text-white/80">{player.sessions}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </motion.main>
  );
}
