"use client";

import Link from "next/link";
import {
  Plus,
  History,
  Calendar,
  Users,
  CircleDollarSign,
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

export default function GamesIndexPage() {
  const [games, setGames] = useState<HistoricalGame[]>(() => getEffectiveHistoricalGames());
  const [searchQuery, setSearchQuery] = useState("");
  const [isAdminUser, setIsAdminUser] = useState(false);
  const [settlements, setSettlements] = useState<SettlementsByGame>(new Map());
  const [selectId, setSelectId] = useState<string | null>(null);
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
      const [remoteDeleted, savedGames, remoteSettlements] = await Promise.all([
        fetchDeletedGameIds(supabase),
        fetchSavedGames(supabase),
        loadAllSettlements(supabase),
      ]);
      if (cancelled) return;
      // Union of local + remote so each surface contributes.
      const merged = new Set<string>([
        ...remoteDeleted,
        ...getDeletedGameIds(),
      ]);
      setGames(getEffectiveHistoricalGamesWith(merged, savedGames));
      setSettlements(remoteSettlements);
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
            return (
              <Link
                key={game.id}
                id={`game-${game.id}`}
                href={`/games/history/${game.id}`}
                className={`group hover:bg-white/5 rounded-xl p-4 border transition-all grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_2fr_1fr] md:items-center gap-3 md:gap-4 ${cardHighlight}`}
              >
                {/* Date */}
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center text-white/50 group-hover:text-[#39FF14] transition-colors border border-white/10 group-hover:border-[#39FF14]/30 shrink-0">
                    <Calendar size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-lg font-bold text-white/90 group-hover:text-white truncate">
                        {game.date}
                      </h3>
                      {unsettledGameIds.has(game.id) && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-black bg-red-400/10 border border-red-400/30 text-red-400 tracking-wider uppercase shrink-0">
                          Unsettled
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-white/40 truncate">
                      {game.duration} · {game.blinds}
                    </p>
                  </div>
                </div>

                {/* Players & Pot side-by-side on mobile, direct grid elements on desktop */}
                <div className="grid grid-cols-2 gap-4 md:contents">
                  {/* Players */}
                  <div className="flex items-center gap-2">
                    <Users size={14} className="text-white/40 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs text-white/40 uppercase font-bold tracking-widest">Players</p>
                      <p className="text-base font-bold text-white/80">{game.players.length}</p>
                    </div>
                  </div>

                  {/* Pot */}
                  <div className="flex items-center gap-2">
                    <CircleDollarSign size={14} className="text-[#39FF14]/60 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs text-white/40 uppercase font-bold tracking-widest">Pot</p>
                      <p className="text-base font-bold text-[#39FF14]">{formatCurrency(game.totalPot)}</p>
                    </div>
                  </div>
                </div>

                {/* Winner — show the player's final stack (`cashOut`) as the
                    headline number with their net profit underneath. Showing
                    only the net was confusing readers who expected the chips
                    they walked away with (e.g. Jake ended on £81.50 with £25
                    in, but the row used to read "+£56.50" in isolation). */}
                <div className="flex items-center gap-2 min-w-0">
                  <Crown size={14} className="text-yellow-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs text-white/40 uppercase font-bold tracking-widest">Winner</p>
                    {winner ? (
                      <>
                        <p className="text-base font-bold text-yellow-400 truncate">
                          {winner.name}{" "}
                          <span className="text-white/90">{formatCurrency(winner.cashOut)}</span>
                        </p>
                        <p className="text-xs text-[#39FF14] font-bold tabular-nums">
                          {formatCurrency(winner.net, true)} profit
                        </p>
                      </>
                    ) : (
                      <p className="text-base font-bold text-white/40">No players</p>
                    )}
                  </div>
                </div>

                {/* View Details — bumped to min-h-11 so it clears the 44px
                    tap-target minimum on mobile. The whole card is also a
                    Link, so this is reinforcement, not the only affordance. */}
                <div className="flex items-center justify-center gap-2 px-3 py-2.5 min-h-11 rounded-lg bg-white/5 group-hover:bg-[#39FF14]/10 group-hover:text-[#39FF14] text-white/60 text-sm font-bold tracking-widest uppercase transition-colors">
                  View Details
                  <ChevronRight size={14} className="opacity-70 shrink-0" />
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
