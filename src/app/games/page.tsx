"use client";

import Link from "next/link";
import {
  Plus,
  History,
  Calendar,
  Users,
  Activity,
  Clock,
  Coins,
  ChevronRight,
  Crown,
  Search,
  Lock,
  Vote,
} from "lucide-react";
import { motion } from "framer-motion";
import { type HistoricalGame } from "@/lib/historical-games";
import { getEffectiveHistoricalGames, getEffectiveHistoricalGamesWith } from "@/lib/game-store";
import { getDeletedGameIds } from "@/lib/local-store";
import { fetchDeletedGameIds } from "@/lib/soft-delete-db";
import { fetchSavedGames } from "@/lib/games-db";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isAdmin } from "@/lib/auth";
import { useState, useEffect, useMemo } from "react";
import { loadAllSettlements, type SettlementsByGame } from "@/lib/ledger";
import { ADMIN_PLAYER, FOOD_PAYER } from "@/lib/local-store";
import { formatCurrency } from "@/lib/format";
import PlayerAvatar from "@/components/PlayerAvatar";

const parseDateParts = (dateStr: string) => {
  const parts = dateStr.replace(/,/g, "").split(" ");
  if (parts.length >= 2) {
    return { month: parts[0], day: parts[1], year: parts[2] };
  }
  return { month: "Game", day: "•", year: "" };
};

export default function GamesIndexPage() {

  const [games, setGames] = useState<HistoricalGame[]>(() => getEffectiveHistoricalGames());
  const [searchQuery, setSearchQuery] = useState("");
  const [isAdminUser, setIsAdminUser] = useState(false);
  const [settlements, setSettlements] = useState<SettlementsByGame>(new Map());
  const [selectId, setSelectId] = useState<string | null>(null);
  const [avatarMap, setAvatarMap] = useState<Record<string, string>>({});
  const supabase = createSupabaseBrowserClient();

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const selId = params.get("select");
      if (selId) {
        setTimeout(() => setSelectId(selId), 0);
      }
    }
  }, []);

  // Load effective games (with localStorage deletes/patches) on mount,
  // then merge in the Supabase-synced deleted set so a delete made on
  // another device propagates to this one, plus any DB-saved finalized
  // sessions from the new `games` table.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [remoteDeleted, savedGames, remoteSettlements, avatarsRes] = await Promise.all([
        fetchDeletedGameIds(supabase),
        fetchSavedGames(supabase),
        loadAllSettlements(supabase),
        supabase.from("players").select("name, avatar_url"),
      ]);
      if (cancelled) return;
      // Union of local + remote so each surface contributes.
      const merged = new Set<string>([
        ...remoteDeleted,
        ...getDeletedGameIds(),
      ]);
      setGames(getEffectiveHistoricalGamesWith(merged, savedGames));
      setSettlements(remoteSettlements);

      if (avatarsRes?.data) {
        const map: Record<string, string> = {};
        avatarsRes.data.forEach((p) => {
          if (p.avatar_url) map[p.name] = p.avatar_url;
        });
        setAvatarMap(map);
      }
    })();
    return () => { cancelled = true; };
  }, [supabase]);

  // Check if user is admin — fast email allow-list first, then DB lookup so
  // users promoted via the `users.is_admin` column also see the admin UI.
  useEffect(() => {
    let cancelled = false;

    const resolveAdmin = async (email?: string | null) => {
      if (!email) {
        if (!cancelled) setIsAdminUser(false);
        return;
      }
      if (isAdmin(email)) {
        if (!cancelled) setIsAdminUser(true);
        return;
      }
      const { data } = await supabase
        .from("users")
        .select("is_admin")
        .eq("email", email)
        .maybeSingle();
      if (!cancelled) setIsAdminUser(data?.is_admin === true);
    };

    supabase.auth.getUser().then(({ data }) => resolveAdmin(data.user?.email));

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, session) => resolveAdmin(session?.user?.email),
    );

    return () => {
      cancelled = true;
      authListener?.subscription.unsubscribe();
    };
  }, [supabase]);

  const unsettledGameIds = useMemo(() => {
    const unsettled = new Set<string>();
    const adminLower = ADMIN_PLAYER.toLowerCase();
    const foodPayerLower = FOOD_PAYER.toLowerCase();

    games.forEach((g) => {
      const settledKeys = settlements.get(g.id) ?? new Set<string>();
      const hasUnsettled = g.players.some((p) => {
        const key = p.name.toLowerCase();
        if (key === adminLower) return false;
        if (settledKeys.has(key)) return false;
        const pokerNet = p.cashOut - p.buyIn;
        const foodOwed = key === foodPayerLower ? 0 : p.food;
        const combined = pokerNet - foodOwed;
        return Math.abs(combined) >= 0.005;
      });
      if (hasUnsettled) {
        unsettled.add(g.id);
      }
    });
    return unsettled;
  }, [games, settlements]);

  useEffect(() => {
    if (selectId) {
      const timer = setTimeout(() => {
        const el = document.getElementById(`game-${selectId}`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [selectId]);

  const summary = useMemo(() => [
    { label: "Total Sessions", value: String(games.length), icon: Activity, color: "text-[#39FF14]" },
    {
      label: "Lifetime Pot",
      value: formatCurrency(games.reduce((sum, g) => sum + g.totalPot, 0)),
      icon: Coins,
      color: "text-cyan-400",
    },
    { label: "Avg Duration", value: "2h 45m", icon: Clock, color: "text-yellow-400" },
    { label: "Most Active Day", value: "Friday", icon: Calendar, color: "text-purple-400" },
  ], [games]);

  const filteredGames = useMemo(() => games.filter(game => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const winner = [...game.players]
      .map(p => ({ ...p, net: p.cashOut - p.buyIn }))
      .sort((a, b) => b.net - a.net)[0];

    if (game.date.toLowerCase().includes(q)) return true;
    // `winner` is undefined if the session has no players at all — an empty
    // historical record. Treat that as a non-match rather than crashing.
    if (winner && winner.name.toLowerCase().includes(q)) return true;
    if (game.players.some(p => p.name.toLowerCase().includes(q))) return true;
    return false;
  }), [games, searchQuery]);

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
            <History className="text-[#39FF14]" size={22} />
          </div>
          <div>
            <h1 className="text-2xl md:text-4xl font-black tracking-tight uppercase leading-none">
              Game Sessions
            </h1>
            <p className="text-white/50 text-base mt-2">Manage active games or view past session histories.</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
          <Link
            href="/games/poll"
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-cyan-400/40 text-white/70 hover:text-cyan-400 font-bold text-base tracking-wide uppercase transition-colors"
          >
            <Vote size={18} />
            Polls
          </Link>

          {isAdminUser ? (
            <Link href="/games/create" className="w-full sm:w-auto">
              <button className="w-full relative group overflow-hidden rounded-xl p-[1px]">
                <span className="absolute inset-0 bg-gradient-to-r from-[#39FF14] to-cyan-400 rounded-xl opacity-70 group-hover:opacity-100 transition-opacity blur-sm"></span>
                <div className="relative bg-black/50 backdrop-blur-xl px-5 py-2.5 rounded-xl flex items-center justify-center gap-2 border border-white/10 group-hover:border-[#39FF14]/50 transition-colors">
                  <Plus className="text-[#39FF14]" size={18} />
                  <span className="font-bold text-base tracking-wide text-white group-hover:text-[#39FF14] transition-colors uppercase">
                    Start New Game
                  </span>
                </div>
              </button>
            </Link>
          ) : (
            <div className="w-full sm:w-auto group" title="Admin access required to start games">
              <button disabled className="w-full relative overflow-hidden rounded-xl p-[1px] opacity-50 cursor-not-allowed">
                <div className="relative bg-black/50 backdrop-blur-xl px-5 py-2.5 rounded-xl flex items-center justify-center gap-2 border border-white/10">
                  <Lock className="text-white/40" size={18} />
                  <span className="font-bold text-base tracking-wide text-white/40 uppercase">
                    Start New Game
                  </span>
                </div>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3 mb-4 shrink-0">
        {summary.map((s) => (
          <div
            key={s.label}
            className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-3 flex items-center gap-3 hover:border-white/20 transition-colors"
          >
            <div className="p-2 rounded-lg bg-black/30 border border-white/5 shrink-0">
              <s.icon className={s.color} size={16} />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold tracking-widest uppercase text-white/40">
                {s.label}
              </p>
              <p className="text-lg md:text-xl font-black text-white truncate">{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="md:flex-1 md:min-h-0 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl flex flex-col md:overflow-hidden">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between px-5 py-3 border-b border-white/10 shrink-0 gap-3">
          <div className="flex items-center gap-3">
            <History className="text-[#39FF14]" size={18} />
            <h2 className="text-base md:text-lg font-black tracking-widest uppercase">Past Sessions</h2>
          </div>
          <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end">
            <div className="relative w-full sm:w-auto">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
              <input
                type="text"
                placeholder="Search date, player..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-black/20 border border-white/10 rounded-lg pl-8 pr-3 py-1.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#39FF14]/50 focus:ring-1 focus:ring-[#39FF14]/50 transition-all w-full sm:w-[200px]"
              />
            </div>
            <span className="hidden md:inline text-xs text-white/30 font-mono uppercase tracking-widest shrink-0">
              {filteredGames.length} sessions
            </span>
          </div>
        </div>

        <div className="md:flex-1 md:min-h-0 md:overflow-auto p-3 md:p-4 grid gap-3">
          {filteredGames.length > 0 ? (
            filteredGames.map((game) => {
            const winner = [...game.players]
              .map((p) => ({ ...p, net: p.cashOut - p.buyIn }))
              .sort((a, b) => b.net - a.net)[0] ?? null;
            const isSelected = game.id === selectId;
            const cardHighlight = isSelected
              ? "border-[#22d3ee]/80 shadow-[0_0_30px_rgba(34,211,238,0.25)] ring-2 ring-[#22d3ee]/40 bg-[#22d3ee]/[0.03]"
              : "border-white/5 hover:border-[#39FF14]/30 bg-black/20";
            const { month, day } = parseDateParts(game.date);
            return (
              <Link
                key={game.id}
                id={`game-${game.id}`}
                href={`/games/history/${game.id}`}
                className={`group rounded-2xl p-4 border transition-all duration-300 flex flex-col md:grid md:grid-cols-[auto_1fr_auto_auto_auto] md:items-center gap-4 ${cardHighlight}`}
              >
                {/* Left: Calendar & Details */}
                <div className="flex items-center gap-4 min-w-0">
                  {/* Calendar Sheet Widget */}
                  <div className="w-12 h-14 bg-black/45 border border-white/10 rounded-xl overflow-hidden flex flex-col items-center shrink-0 shadow-lg group-hover:border-[#39FF14]/30 transition-colors">
                    <span className="w-full text-center text-[9px] font-black tracking-widest uppercase bg-white/5 py-1 text-white/40 border-b border-white/10 group-hover:bg-[#39FF14]/15 group-hover:text-[#39FF14] transition-colors">
                      {month.slice(0, 3)}
                    </span>
                    <span className="text-lg font-black text-white tracking-tighter flex-1 flex items-center justify-center">
                      {day}
                    </span>
                  </div>
                  
                  {/* Session Details */}
                  <div className="min-w-0 flex-1 flex flex-col gap-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-base md:text-lg font-bold text-white group-hover:text-[#39FF14] transition-colors truncate">
                        {game.date}
                      </h3>
                      {unsettledGameIds.has(game.id) && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-black bg-red-500/10 border border-red-500/30 text-red-400 tracking-wider uppercase shadow-[0_0_12px_rgba(239,68,68,0.1)] shrink-0">
                          Unsettled
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-white/50 flex-wrap">
                      <span className="flex items-center gap-1">
                        <Clock size={12} className="text-white/30 shrink-0" />
                        {game.duration}
                      </span>
                      <span>·</span>
                      <span className="px-1.5 py-0.5 rounded bg-cyan-400/10 border border-cyan-400/20 text-cyan-300 font-semibold text-[10px]">
                        {game.blinds}
                      </span>
                      {game.location && (
                        <>
                          <span>·</span>
                          <span className="truncate max-w-[120px] sm:max-w-[200px]" title={game.location}>{game.location}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Middle-Left: Stats (Players & Pot) */}
                <div className="flex items-center gap-3 bg-black/20 border border-white/5 rounded-xl p-2 self-start md:self-auto shrink-0 w-full sm:w-auto justify-around sm:justify-start">
                  {/* Players */}
                  <div className="px-4 py-0.5 flex flex-col justify-center border-r border-white/5 flex-1 sm:flex-initial">
                    <span className="text-[9px] text-white/40 uppercase font-black tracking-widest block mb-0.5">Players</span>
                    <div className="flex items-center gap-1.5">
                      <Users size={12} className="text-white/40 shrink-0" />
                      <span className="text-sm font-bold text-white/80">{game.players.length}</span>
                    </div>
                  </div>
                  {/* Pot */}
                  <div className="px-4 py-0.5 flex flex-col justify-center flex-1 sm:flex-initial">
                    <span className="text-[9px] text-white/40 uppercase font-black tracking-widest block mb-0.5 font-bold">Total Pot</span>
                    <div className="flex items-center gap-1.5">
                      <Coins size={12} className="text-[#39FF14]/60 shrink-0" />
                      <span className="text-sm font-black text-[#39FF14]">{formatCurrency(game.totalPot)}</span>
                    </div>
                  </div>
                </div>

                {/* Middle-Right: Winner Spotlight */}
                <div className="flex items-center gap-3 bg-yellow-500/5 border border-yellow-500/10 rounded-xl p-2 w-full sm:w-auto shrink-0">
                  {winner ? (
                    <>
                      <div className="relative shrink-0">
                        <PlayerAvatar
                          name={winner.name}
                          avatarUrl={avatarMap[winner.name]}
                          size={36}
                          className="rounded-full border border-yellow-500/30"
                        />
                        <div className="absolute -top-1.5 -right-1.5 bg-yellow-500/20 border border-yellow-500/40 text-yellow-400 rounded-full p-0.5">
                          <Crown size={10} className="fill-yellow-400 text-yellow-400" />
                        </div>
                      </div>
                      <div className="min-w-0 flex-1 sm:flex-initial">
                        <span className="text-[9px] text-yellow-500/70 uppercase font-black tracking-widest block mb-0.5">Winner</span>
                        <p className="text-xs font-bold text-white truncate max-w-[140px]">
                          {winner.name} <span className="text-white/60 font-medium">({formatCurrency(winner.cashOut)})</span>
                        </p>
                        <p className="text-[10px] text-[#39FF14] font-black tracking-wide">
                          +{formatCurrency(winner.net)} profit
                        </p>
                      </div>
                    </>
                  ) : (
                    <div className="text-xs font-bold uppercase tracking-widest text-white/30 w-full text-center py-2 px-4">
                      No players
                    </div>
                  )}
                </div>

                {/* Right: Action arrow (hidden on mobile, visible on desktop) */}
                <div className="hidden md:flex h-10 w-10 rounded-xl bg-white/5 group-hover:bg-[#39FF14]/15 border border-white/10 group-hover:border-[#39FF14]/30 text-white/50 group-hover:text-[#39FF14] items-center justify-center shrink-0 transition-all duration-300">
                  <ChevronRight size={18} className="group-hover:translate-x-0.5 transition-transform" />
                </div>
              </Link>
            );
          })) : (
            <div className="flex flex-col items-center justify-center py-12 text-white/40">
              <Search size={48} className="mb-4 opacity-20" />
              <p className="text-sm font-bold tracking-widest uppercase">No sessions found</p>
              <p className="text-xs text-white/30 mt-1">Try adjusting your search filters.</p>
            </div>
          )}
        </div>
      </div>
    </motion.main>
  );
}
