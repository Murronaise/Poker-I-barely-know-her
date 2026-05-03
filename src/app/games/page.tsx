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
} from "lucide-react";
import { motion } from "framer-motion";
import { historicalGames } from "@/lib/historical-games";
import { useState } from "react";

export default function GamesIndexPage() {
  const summary = [
    { label: "Total Sessions", value: "14", icon: Activity, color: "text-[#39FF14]" },
    { label: "Lifetime Pot", value: "£18,400", icon: Coins, color: "text-cyan-400" },
    { label: "Avg Duration", value: "4h 52m", icon: Clock, color: "text-yellow-400" },
    { label: "Most Active Day", value: "Friday", icon: Calendar, color: "text-purple-400" },
  ];

  const [searchQuery, setSearchQuery] = useState("");

  const filteredGames = historicalGames.filter(game => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const winner = [...game.players]
      .map(p => ({ ...p, net: p.cashOut - p.buyIn - p.food }))
      .sort((a, b) => b.net - a.net)[0];
    
    if (game.date.toLowerCase().includes(q)) return true;
    if (winner.name.toLowerCase().includes(q)) return true;
    if (game.players.some(p => p.name.toLowerCase().includes(q))) return true;
    return false;
  });

  return (
    <motion.main
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="flex-1 min-h-0 flex flex-col overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(57,255,20,0.05)_0%,_rgba(14,17,23,1)_60%)] text-[#FAFAFA] px-6 xl:px-12 py-5"
    >
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-5 gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-[#39FF14]/10 rounded-xl border border-[#39FF14]/20 shrink-0">
            <History className="text-[#39FF14]" size={22} />
          </div>
          <div>
            <h1 className="text-3xl md:text-4xl font-black tracking-tight uppercase leading-none">
              Game Sessions
            </h1>
            <p className="text-white/50 text-base mt-2">Manage active games or view past session histories.</p>
          </div>
        </div>

        <Link href="/games/create" className="w-full md:w-auto">
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
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3 mb-4 shrink-0">
        {summary.map((s) => (
          <div
            key={s.label}
            className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl p-3 flex items-center gap-3 hover:border-white/20 transition-colors"
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

      <div className="flex-1 min-h-0 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl flex flex-col overflow-hidden">
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

        <div className="flex-1 min-h-0 overflow-auto p-3 md:p-4 grid gap-3">
          {filteredGames.length > 0 ? (
            filteredGames.map((game) => {
            const winner = [...game.players]
              .map((p) => ({ ...p, net: p.cashOut - p.buyIn - p.food }))
              .sort((a, b) => b.net - a.net)[0];
            return (
              <Link
                key={game.id}
                href={`/games/history/${game.id}`}
                className="group bg-black/20 hover:bg-white/5 border border-white/5 hover:border-[#39FF14]/30 rounded-xl p-4 transition-all flex flex-col md:flex-row md:items-center justify-between gap-3"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center text-white/50 group-hover:text-[#39FF14] transition-colors border border-white/10 group-hover:border-[#39FF14]/30 shrink-0">
                    <Calendar size={16} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white/90 group-hover:text-white">
                      {game.date}
                    </h3>
                    <p className="text-sm text-white/40">
                      {game.duration} · {game.blinds}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-6 md:gap-10">
                  <div className="flex items-center gap-2">
                    <Users size={14} className="text-white/40" />
                    <div>
                      <p className="text-xs text-white/40 uppercase font-bold tracking-widest">Players</p>
                      <p className="text-base font-bold text-white/80">{game.players.length}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <CircleDollarSign size={14} className="text-[#39FF14]/60" />
                    <div>
                      <p className="text-xs text-white/40 uppercase font-bold tracking-widest">Pot</p>
                      <p className="text-base font-bold text-[#39FF14]">£{game.totalPot.toLocaleString()}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Crown size={14} className="text-yellow-400" />
                    <div>
                      <p className="text-xs text-white/40 uppercase font-bold tracking-widest">Winner</p>
                      <p className="text-base font-bold text-yellow-400">
                        {winner.name} <span className="text-[#39FF14]">+£{winner.net}</span>
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 group-hover:bg-[#39FF14]/10 group-hover:text-[#39FF14] text-white/60 text-sm font-bold tracking-widest uppercase transition-colors">
                    View Details
                    <ChevronRight size={14} className="opacity-70" />
                  </div>
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
