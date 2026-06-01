"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Crown,
  ArrowRightSquare,
  TrendingDown,
  TrendingUp,
  Pizza,
  Check,
  AlertTriangle,
  Info,
} from "lucide-react";
import PlayerAvatar from "@/components/PlayerAvatar";
import SettlementSettleButton from "@/components/SettlementSettleButton";
import WhatsAppSettlementButton from "@/components/WhatsAppSettlementButton";
import {
  activeProviders,
  buildPaymentLink,
  getHandlesFor,
  PROVIDER_LABEL,
  type PaymentHandles,
} from "@/lib/payment-links";
import { type HistoricalGame } from "@/lib/historical-games";
import { type SettlementRecord } from "@/lib/settlements-db";
import { formatCurrency } from "@/lib/format";

type GameHistoryDetailsProps = {
  game: HistoricalGame;
  ranked: Array<{
    name: string;
    buyIn: number;
    cashOut: number;
    food: number;
    net: number;
  }>;
  avatarMap: Record<string, string>;
  settlements: Array<{
    from: string;
    to: string;
    pence: number;
    buyInPence: number;
    cashOutPence: number;
    foodPence: number;
  }>;
  payouts: Array<{
    to: string;
    from: string;
    pence: number;
    buyInPence: number;
    cashOutPence: number;
    foodPence: number;
  }>;
  userIsAdmin: boolean;
  settledPlayersList: string[];
  paymentHandles: Map<string, PaymentHandles>;
  settlementRecordsRaw: Record<string, SettlementRecord>;
  totalBuyIn: number;
  totalFood: number;
  loggedInPlayerName: string | null;
};

export default function GameHistoryDetails({
  game,
  ranked,
  avatarMap,
  settlements,
  payouts,
  userIsAdmin,
  settledPlayersList,
  paymentHandles,
  settlementRecordsRaw,
  totalBuyIn,
  totalFood,
  loggedInPlayerName,
}: GameHistoryDetailsProps) {
  const [activeTab, setActiveTab] = useState<"standings" | "payments">("standings");
  const settledPlayers = new Set(settledPlayersList);
  const [viewMode, setViewMode] = useState<"simplified" | "advanced">(userIsAdmin ? "advanced" : "simplified");

  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setNow(Date.now());
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const relativeTime = (iso: string): string => {
    if (!now) return "just now";
    const ms = now - new Date(iso).getTime();
    if (!Number.isFinite(ms) || ms < 0) return "just now";
    const minutes = Math.floor(ms / 60_000);
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(iso).toLocaleDateString();
  };

  const settlementMetaFor = (playerName: string): SettlementRecord | null => {
    return settlementRecordsRaw[playerName.toLowerCase()] ?? null;
  };

  return (
    <div className="flex flex-col gap-6 mb-8">
      {/* Control Bar: Tabs & View Toggle */}
      <div className="flex items-center justify-between gap-4 flex-wrap bg-black/20 border border-white/5 rounded-2xl p-2 shrink-0">
        {/* Segmented Tab Switcher (Mobile Only) */}
        <div className="lg:hidden p-1 bg-black/40 border border-white/10 rounded-xl inline-flex shrink-0">
          <button
            onClick={() => setActiveTab("standings")}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-black tracking-widest uppercase rounded-lg transition-all duration-200 ${
              activeTab === "standings"
                ? "bg-[#39FF14]/15 border border-[#39FF14]/40 text-[#39FF14] shadow-[0_0_12px_rgba(57,255,20,0.15)]"
                : "border border-transparent text-white/40 hover:text-white"
            }`}
          >
            <Crown size={14} />
            Standings
          </button>
          <button
            onClick={() => setActiveTab("payments")}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-black tracking-widest uppercase rounded-lg transition-all duration-200 ${
              activeTab === "payments"
                ? "bg-[#39FF14]/15 border border-[#39FF14]/40 text-[#39FF14] shadow-[0_0_12px_rgba(57,255,20,0.15)]"
                : "border border-transparent text-white/40 hover:text-white"
            }`}
          >
            <ArrowRightSquare size={14} />
            Payments
          </button>
        </div>

        {/* View Mode Switcher (Visible to all) */}
        <div className="p-1 bg-black/40 border border-white/10 rounded-xl inline-flex ml-auto shrink-0">
          <button
            onClick={() => setViewMode("simplified")}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-black tracking-widest uppercase rounded-lg transition-all duration-200 ${
              viewMode === "simplified"
                ? "bg-cyan-500/15 border border-cyan-400/40 text-cyan-400 shadow-[0_0_12px_rgba(6,182,212,0.15)]"
                : "border border-transparent text-white/40 hover:text-white"
            }`}
          >
            Simplified
          </button>
          <button
            onClick={() => setViewMode("advanced")}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-black tracking-widest uppercase rounded-lg transition-all duration-200 ${
              viewMode === "advanced"
                ? "bg-cyan-500/15 border border-cyan-400/40 text-cyan-400 shadow-[0_0_12px_rgba(6,182,212,0.15)]"
                : "border border-transparent text-white/40 hover:text-white"
            }`}
          >
            Advanced
          </button>
        </div>
      </div>

      {/* Responsive Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* STANDINGS SECTION */}
        <div
          className={`lg:col-span-2 flex flex-col gap-4 ${
            activeTab === "standings" ? "block" : "hidden lg:block"
          }`}
        >
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-5 md:p-6 shadow-xl flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-5">
              <div>
                <h2 className="text-lg font-black tracking-wider uppercase text-white flex items-center gap-2">
                  <Crown className="text-yellow-400" size={20} />
                  Game Standings
                </h2>
                <p className="text-xs text-white/50 mt-0.5">Final leaderboard and performance breakdown</p>
              </div>
            </div>

            {/* Winner Podium (Top 3) */}
            {ranked.length > 0 && (
              <div className="grid grid-cols-3 gap-3 mb-6 items-end pt-2 px-1">
                {/* 2nd Place */}
                {ranked[1] && (
                  <div className="flex flex-col items-center text-center p-3 bg-white/[0.02] border border-white/5 rounded-2xl relative min-w-0">
                    <div className="absolute top-0 -translate-y-1/2 bg-slate-300/10 text-slate-300 border border-slate-300/20 text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full">
                      2nd Place
                    </div>
                    <div className="relative mt-2">
                      <PlayerAvatar
                        name={ranked[1].name}
                        avatarUrl={avatarMap[ranked[1].name]}
                        size={48}
                        className="rounded-full border-2 border-slate-400/50"
                      />
                    </div>
                    <p className="text-xs font-bold text-white/90 truncate w-full mt-2">{ranked[1].name}</p>
                    <span className="text-xs font-black text-[#39FF14] mt-1 tabular-nums">
                      {formatCurrency(ranked[1].net, true)}
                    </span>
                  </div>
                )}

                {/* 1st Place */}
                {ranked[0] && (
                  <div className="flex flex-col items-center text-center p-4 bg-[#39FF14]/5 border border-[#39FF14]/20 rounded-2xl relative min-w-0 shadow-[0_0_20px_rgba(57,255,20,0.04)] scale-105 z-10">
                    <div className="absolute top-0 -translate-y-1/2 bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 text-[9px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full flex items-center gap-1">
                      <Crown size={9} className="fill-yellow-400 text-yellow-400" />
                      Winner
                    </div>
                    <div className="relative mt-2">
                      <PlayerAvatar
                        name={ranked[0].name}
                        avatarUrl={avatarMap[ranked[0].name]}
                        size={56}
                        className="rounded-full border-2 border-yellow-400 shadow-[0_0_15px_rgba(234,179,8,0.2)]"
                      />
                    </div>
                    <p className="text-sm font-black text-white truncate w-full mt-2">{ranked[0].name}</p>
                    <span className="text-sm font-black text-[#39FF14] mt-1 tabular-nums">
                      {formatCurrency(ranked[0].net, true)}
                    </span>
                  </div>
                )}

                {/* 3rd Place */}
                {ranked[2] && (
                  <div className="flex flex-col items-center text-center p-3 bg-white/[0.02] border border-white/5 rounded-2xl relative min-w-0">
                    <div className="absolute top-0 -translate-y-1/2 bg-amber-600/10 text-amber-500 border border-amber-600/20 text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full">
                      3rd Place
                    </div>
                    <div className="relative mt-2">
                      <PlayerAvatar
                        name={ranked[2].name}
                        avatarUrl={avatarMap[ranked[2].name]}
                        size={48}
                        className="rounded-full border-2 border-amber-600/50"
                      />
                    </div>
                    <p className="text-xs font-bold text-white/90 truncate w-full mt-2">{ranked[2].name}</p>
                    <span className="text-xs font-black text-[#39FF14] mt-1 tabular-nums">
                      {formatCurrency(ranked[2].net, true)}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Leaderboard list */}
            <div className="flex flex-col gap-2">
              {ranked.map((p, i) => {
                const isProfit = p.net >= 0;
                return (
                  <Link
                    key={p.name}
                    href={`/profile/${encodeURIComponent(p.name.toLowerCase().replace(/ /g, "-"))}`}
                    className="bg-white/[0.02] border border-white/5 hover:border-white/15 rounded-xl p-3 flex items-center justify-between gap-4 hover:bg-white/[0.04] hover:shadow-[0_4px_12px_rgba(0,0,0,0.15)] transition-all duration-200 group"
                  >
                    {/* Left: Rank, Avatar, Name */}
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <span className="w-5 text-center font-mono text-xs font-bold text-white/40 group-hover:text-white/60 shrink-0">
                        {i + 1}
                      </span>
                      <PlayerAvatar
                        name={p.name}
                        avatarUrl={avatarMap[p.name]}
                        size={36}
                        className="rounded-full border border-white/10 shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-sm text-white group-hover:text-[#39FF14] transition-colors truncate">{p.name}</p>
                        {/* Mobile view sub-stats */}
                        {viewMode === "advanced" && (
                          <div className="flex items-center gap-2 mt-0.5 text-[10px] text-white/40 font-semibold md:hidden">
                            <span>In: {formatCurrency(p.buyIn)}</span>
                            <span>·</span>
                            <span>Out: {formatCurrency(p.cashOut)}</span>
                            {p.food > 0 && (
                              <>
                                <span>·</span>
                                <span className="text-yellow-400/80">Food: {formatCurrency(p.food)}</span>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Middle: Desktop view sub-stats */}
                    {viewMode === "advanced" && (
                      <div className="hidden md:flex items-center gap-6 text-right shrink-0">
                        <div className="w-16">
                          <span className="block text-[9px] font-bold text-white/30 uppercase tracking-wider">Buy-in</span>
                          <span className="text-xs font-bold text-white/70 tabular-nums">{formatCurrency(p.buyIn)}</span>
                        </div>
                        <div className="w-16">
                          <span className="block text-[9px] font-bold text-white/30 uppercase tracking-wider">Cash Out</span>
                          <span className="text-xs font-bold text-white/70 tabular-nums">{formatCurrency(p.cashOut)}</span>
                        </div>
                        <div className="w-16">
                          <span className="block text-[9px] font-bold text-white/30 uppercase tracking-wider">Food</span>
                          <span className="text-xs font-bold text-yellow-400/70 tabular-nums">
                            {p.food > 0 ? formatCurrency(p.food) : "—"}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Right: Net profit badge */}
                    <div className="shrink-0 text-right w-20 md:w-24">
                      <span
                        className={`inline-flex items-center justify-end px-2.5 py-1.5 rounded-lg text-xs md:text-sm font-black w-full text-right ${
                          isProfit
                            ? "bg-[#39FF14]/10 border border-[#39FF14]/20 text-[#39FF14] shadow-[0_0_10px_rgba(57,255,20,0.03)]"
                            : "bg-red-500/10 border border-red-500/20 text-red-400"
                        }`}
                      >
                        {formatCurrency(p.net, true)}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>

            {/* Totals highlighted cards */}
            <div className="grid grid-cols-3 gap-3 mt-6 pt-5 border-t border-white/10">
              <div className="bg-black/30 border border-white/5 rounded-xl p-3 text-center">
                <p className="text-[9px] font-black text-white/40 uppercase tracking-widest mb-1">Buy-ins</p>
                <p className="text-xs md:text-sm font-black text-white/80 tabular-nums">{formatCurrency(totalBuyIn)}</p>
              </div>
              <div className="bg-black/30 border border-white/5 rounded-xl p-3 text-center">
                <p className="text-[9px] font-black text-white/40 uppercase tracking-widest mb-1 flex items-center justify-center gap-1">
                  <Pizza size={10} className="text-yellow-400" /> Food Spend
                </p>
                <p className="text-xs md:text-sm font-black text-yellow-400/80 tabular-nums">{formatCurrency(totalFood)}</p>
              </div>
              <div className="bg-[#39FF14]/5 border border-[#39FF14]/10 rounded-xl p-3 text-center shadow-[0_0_15px_rgba(57,255,20,0.02)]">
                <p className="text-[9px] font-black text-[#39FF14]/60 uppercase tracking-widest mb-1">Total Pot</p>
                <p className="text-xs md:text-sm font-black text-[#39FF14] tabular-nums">{formatCurrency(game.totalPot)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* PAYMENTS SECTION */}
        <div
          className={`lg:col-span-1 flex flex-col gap-4 ${
            activeTab === "payments" ? "block" : "hidden lg:block"
          }`}
        >
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-5 md:p-6 shadow-xl flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-5 flex-wrap gap-2">
              <div>
                <h2 className="text-lg font-black tracking-wider uppercase text-white flex items-center gap-2">
                  <ArrowRightSquare className="text-cyan-400" size={20} />
                  Ledger
                </h2>
                <p className="text-xs text-white/50 mt-0.5">Admin-collects-all settlements</p>
              </div>
              {userIsAdmin && (
                <div className="shrink-0">
                  <WhatsAppSettlementButton game={game} />
                </div>
              )}
            </div>

            {(() => {
              if (!loggedInPlayerName) return null;
              const userLower = loggedInPlayerName.toLowerCase();
              const playerInGame = game.players.find(p => p.name.toLowerCase() === userLower);
              if (!playerInGame) return null;

              const mySettlement = settlements.find(s => s.from.toLowerCase() === userLower);
              const myPayout = payouts.find(p => p.to.toLowerCase() === userLower);
              const isSettled = settledPlayers.has(userLower);

              if (mySettlement) {
                const receiverHandles = getHandlesFor(paymentHandles, mySettlement.to);
                const providers = activeProviders(receiverHandles);
                return (
                  <div className={`p-4 rounded-xl border mb-5 flex flex-col gap-3 transition-all ${
                    isSettled
                      ? "bg-[#39FF14]/5 border-[#39FF14]/20 shadow-[0_0_15px_rgba(57,255,20,0.02)]"
                      : "bg-red-500/5 border-red-500/20 shadow-[0_0_15px_rgba(239,68,68,0.02)]"
                  }`}>
                    <div className="flex items-center gap-2">
                      {isSettled ? (
                        <Check className="text-[#39FF14]" size={16} />
                      ) : (
                        <AlertTriangle className="text-red-400" size={16} />
                      )}
                      <p className="text-xs font-black uppercase tracking-wider text-white">
                        Your Settlement
                      </p>
                    </div>
                    <div>
                      {isSettled ? (
                        <p className="text-xs text-white/70">
                          You are fully settled! Your payment of{" "}
                          <span className="font-bold text-[#39FF14]">{formatCurrency(mySettlement.pence / 100)}</span> was marked as paid.
                        </p>
                      ) : (
                        <p className="text-xs text-white/70">
                          You owe <span className="text-red-400 font-bold">{mySettlement.to}</span> a total of{" "}
                          <span className="font-bold text-red-400">{formatCurrency(mySettlement.pence / 100)}</span>. Please settle up:
                        </p>
                      )}
                    </div>
                    {!isSettled && providers.length > 0 && (
                      <div className="flex items-center gap-1.5 flex-wrap pt-2 border-t border-white/5">
                        {providers.map((provider) => {
                          const href = buildPaymentLink(provider, receiverHandles[provider], mySettlement.pence);
                          if (!href) return null;
                          return (
                            <a
                              key={provider}
                              href={href}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center px-2 py-1 rounded text-[8px] font-black tracking-widest uppercase border border-white/10 hover:border-white/20 text-white/60 hover:text-white bg-black/40 transition-colors"
                            >
                              {PROVIDER_LABEL[provider]}
                            </a>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              }

              if (myPayout) {
                return (
                  <div className={`p-4 rounded-xl border mb-5 flex flex-col gap-2 transition-all ${
                    isSettled
                      ? "bg-[#39FF14]/5 border-[#39FF14]/20"
                      : "bg-cyan-500/5 border-cyan-500/20 shadow-[0_0_15px_rgba(6,182,212,0.02)]"
                  }`}>
                    <div className="flex items-center gap-2">
                      {isSettled ? (
                        <Check className="text-[#39FF14]" size={16} />
                      ) : (
                        <Info className="text-cyan-400" size={16} />
                      )}
                      <p className="text-xs font-black uppercase tracking-wider text-white">
                        Your Settlement
                      </p>
                    </div>
                    <p className="text-xs text-white/70">
                      {isSettled ? (
                        <>
                          You have been paid! Admin settled your payout of{" "}
                          <span className="font-bold text-[#39FF14]">{formatCurrency(myPayout.pence / 100)}</span>.
                        </>
                      ) : (
                        <>
                          Admin owes you{" "}
                          <span className="font-bold text-cyan-400">{formatCurrency(myPayout.pence / 100)}</span>. Your payout is pending.
                        </>
                      )}
                    </p>
                  </div>
                );
              }

              return (
                <div className="p-4 rounded-xl border border-white/10 bg-white/[0.02] mb-5 flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <Check className="text-[#39FF14]" size={16} />
                    <p className="text-xs font-black uppercase tracking-wider text-white">
                      Your Settlement
                    </p>
                  </div>
                  <p className="text-xs text-white/70">You are all square for this session!</p>
                </div>
              );
            })()}

            {settlements.length === 0 && payouts.length === 0 ? (
              <p className="text-sm text-white/40 py-8 text-center bg-black/10 border border-dashed border-white/15 rounded-xl">
                No payments required for this session
              </p>
            ) : viewMode === "simplified" ? (
              <div className="flex flex-col gap-5">
                {/* Incoming (Owed to Admin) */}
                {settlements.length > 0 && (
                  <div className="flex flex-col gap-2.5">
                    <h3 className="text-[10px] font-black tracking-wider uppercase text-red-400 bg-red-500/10 border border-red-500/20 px-3 py-1.5 rounded-lg flex items-center gap-2">
                      <TrendingDown size={12} className="shrink-0" />
                      Incoming Settlements
                    </h3>
                    <div className="flex flex-col gap-2">
                      {settlements.map((s, i) => {
                        const meta = settlementMetaFor(s.from);
                        return (
                          <div
                            key={`owe-simple-${i}`}
                            className="bg-white/[0.01] border border-white/5 rounded-xl px-3 py-2 flex items-center justify-between gap-3"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <PlayerAvatar
                                name={s.from}
                                avatarUrl={avatarMap[s.from]}
                                size={24}
                                className="rounded-full border border-white/10 shrink-0"
                              />
                              <span className="text-xs font-bold text-white/80 truncate">{s.from}</span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-xs font-bold text-red-400/80 tabular-nums">
                                {formatCurrency(s.pence / 100)}
                              </span>
                              {meta ? (
                                <span className="text-[9px] font-bold uppercase tracking-widest text-[#39FF14] bg-[#39FF14]/10 border border-[#39FF14]/20 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                                  <Check size={8} /> Paid
                                </span>
                              ) : (
                                <span className="text-[9px] font-bold uppercase tracking-widest text-white/30 bg-white/5 border border-white/5 px-1.5 py-0.5 rounded">
                                  Owing
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Outgoing (Admin Payouts) */}
                {payouts.length > 0 && (
                  <div className="flex flex-col gap-2.5">
                    <h3 className="text-[10px] font-black tracking-wider uppercase text-[#39FF14] bg-[#39FF14]/10 border border-[#39FF14]/20 px-3 py-1.5 rounded-lg flex items-center gap-2">
                      <TrendingUp size={12} className="shrink-0" />
                      Outgoing Payouts
                    </h3>
                    <div className="flex flex-col gap-2">
                      {payouts.map((p, i) => {
                        const meta = settlementMetaFor(p.to);
                        return (
                          <div
                            key={`pay-simple-${i}`}
                            className="bg-white/[0.01] border border-white/5 rounded-xl px-3 py-2 flex items-center justify-between gap-3"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <PlayerAvatar
                                name={p.to}
                                avatarUrl={avatarMap[p.to]}
                                size={24}
                                className="rounded-full border border-white/10 shrink-0"
                              />
                              <span className="text-xs font-bold text-white/80 truncate">{p.to}</span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-xs font-bold text-[#39FF14]/80 tabular-nums">
                                {formatCurrency(p.pence / 100)}
                              </span>
                              {meta ? (
                                <span className="text-[9px] font-bold uppercase tracking-widest text-[#39FF14] bg-[#39FF14]/10 border border-[#39FF14]/20 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                                  <Check size={8} /> Paid
                                </span>
                              ) : (
                                <span className="text-[9px] font-bold uppercase tracking-widest text-white/30 bg-white/5 border border-white/5 px-1.5 py-0.5 rounded">
                                  Pending
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-6">
                {/* Incoming (Owed to Admin) */}
                <div className="flex flex-col gap-3">
                  <h3 className="text-[10px] font-black tracking-wider uppercase text-red-400 bg-red-500/10 border border-red-500/20 px-3 py-1.5 rounded-lg flex items-center gap-2">
                    <TrendingDown size={12} className="shrink-0" />
                    Incoming (Owed to Admin)
                  </h3>
                  {settlements.length === 0 ? (
                    <p className="text-xs text-white/30 py-6 text-center bg-black/10 border border-dashed border-white/5 rounded-xl">
                      No incoming payments pending
                    </p>
                  ) : (
                    <div className="flex flex-col gap-2.5">
                      {settlements.map((s, i) => {
                        const receiverHandles = getHandlesFor(paymentHandles, s.to);
                        const providers = activeProviders(receiverHandles);
                        const meta = settlementMetaFor(s.from);
                        return (
                          <div
                            key={`owe-${i}`}
                            className="bg-white/[0.02] border border-white/5 rounded-xl p-3.5 flex flex-col gap-3 hover:border-white/10 transition-all duration-200"
                          >
                            {/* Top row: avatar/name + amount */}
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <PlayerAvatar
                                  name={s.from}
                                  avatarUrl={avatarMap[s.from]}
                                  size={32}
                                  className="rounded-full border border-white/10 shrink-0"
                                />
                                <div className="min-w-0 flex-1">
                                  <p className="text-xs font-black text-white truncate">{s.from}</p>
                                  <p className="text-[9px] text-white/40 uppercase tracking-widest font-bold">
                                    owes {s.to}
                                  </p>
                                </div>
                              </div>
                              <p className="text-base font-black text-red-400 tabular-nums shrink-0">
                                {formatCurrency(s.pence / 100)}
                              </p>
                            </div>

                            {/* Details: small mono box */}
                            <div className="bg-black/30 border border-white/5 rounded-lg px-2.5 py-1.5 flex items-center justify-between text-[9px] text-white/40 font-mono">
                              <span>Breakdown:</span>
                              <span className="tabular-nums">
                                {[
                                  s.buyInPence > 0 ? `Buy-in ${formatCurrency(s.buyInPence / 100)}` : null,
                                  s.cashOutPence > 0 ? `Cash-out ${formatCurrency(s.cashOutPence / 100)}` : null,
                                  s.foodPence > 0 ? `Food ${formatCurrency(s.foodPence / 100)}` : null,
                                ].filter(Boolean).join(" · ")}
                              </span>
                            </div>

                            {/* Footer actions: settle state/links + button */}
                            <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/5 flex-wrap">
                              {/* Left part: Payment links or Settled text */}
                              <div className="flex items-center gap-1 flex-wrap">
                                {providers.length > 0 && !meta ? (
                                  <>
                                    <span className="text-[8px] font-black tracking-widest uppercase text-white/30 mr-1">
                                      Pay:
                                    </span>
                                    {providers.map((provider) => {
                                      const href = buildPaymentLink(provider, receiverHandles[provider], s.pence);
                                      if (!href) return null;
                                      return (
                                        <a
                                          key={provider}
                                          href={href}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className={`inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-black tracking-widest uppercase border border-white/10 hover:border-white/20 text-white/50 hover:text-white bg-black/40 transition-colors`}
                                        >
                                          {PROVIDER_LABEL[provider]}
                                        </a>
                                      );
                                    })}
                                  </>
                                ) : null}
                                {meta && (
                                  <p className="text-[9px] text-[#39FF14]/80 tracking-wider truncate" title={new Date(meta.settledAt).toLocaleString()}>
                                    Paid {relativeTime(meta.settledAt)}
                                    {meta.settledByName ? ` · ${meta.settledByName}` : ""}
                                  </p>
                                )}
                              </div>

                              {/* Right part: Action button */}
                              <div className="shrink-0">
                                <SettlementSettleButton
                                  gameId={game.id}
                                  playerName={s.from}
                                  isAdmin={userIsAdmin}
                                  initialSettled={settledPlayers.has(s.from.toLowerCase())}
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Outgoing (Admin Payouts) */}
                <div className="flex flex-col gap-3">
                  <h3 className="text-[10px] font-black tracking-wider uppercase text-[#39FF14] bg-[#39FF14]/10 border border-[#39FF14]/20 px-3 py-1.5 rounded-lg flex items-center gap-2">
                    <TrendingUp size={12} className="shrink-0" />
                    Outgoing (Admin Payouts)
                  </h3>
                  {payouts.length === 0 ? (
                    <p className="text-xs text-white/30 py-6 text-center bg-black/10 border border-dashed border-white/5 rounded-xl">
                      No outgoing payouts pending
                    </p>
                  ) : (
                    <div className="flex flex-col gap-2.5">
                      {payouts.map((p, i) => {
                        const receiverHandles = getHandlesFor(paymentHandles, p.to);
                        const providers = activeProviders(receiverHandles);
                        const meta = settlementMetaFor(p.to);
                        return (
                          <div
                            key={`pay-${i}`}
                            className="bg-white/[0.02] border border-white/5 rounded-xl p-3.5 flex flex-col gap-3 hover:border-white/10 transition-all duration-200"
                          >
                            {/* Top row: avatar/name + amount */}
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <PlayerAvatar
                                  name={p.to}
                                  avatarUrl={avatarMap[p.to]}
                                  size={32}
                                  className="rounded-full border border-white/10 shrink-0"
                                />
                                <div className="min-w-0 flex-1">
                                  <p className="text-xs font-black text-white truncate">{p.to}</p>
                                  <p className="text-[9px] text-[#39FF14]/70 uppercase tracking-widest font-bold">
                                    receives from {p.from}
                                  </p>
                                </div>
                              </div>
                              <p className="text-base font-black text-[#39FF14] tabular-nums shrink-0">
                                {formatCurrency(p.pence / 100)}
                              </p>
                            </div>

                            {/* Details: small mono box */}
                            <div className="bg-black/30 border border-white/5 rounded-lg px-2.5 py-1.5 flex items-center justify-between text-[9px] text-white/40 font-mono">
                              <span>Breakdown:</span>
                              <span className="tabular-nums">
                                {[
                                  p.buyInPence > 0 ? `Buy-in ${formatCurrency(p.buyInPence / 100)}` : null,
                                  p.cashOutPence > 0 ? `Cash-out ${formatCurrency(p.cashOutPence / 100)}` : null,
                                  p.foodPence > 0 ? `Food ${formatCurrency(p.foodPence / 100)}` : null,
                                ].filter(Boolean).join(" · ")}
                              </span>
                            </div>

                            {/* Footer actions: settle state/links + button */}
                            <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/5 flex-wrap">
                              {/* Left part: Payment links or Settled text */}
                              <div className="flex items-center gap-1 flex-wrap">
                                {providers.length > 0 && !meta ? (
                                  <>
                                    <span className="text-[8px] font-black tracking-widest uppercase text-white/30 mr-1">
                                      Pay:
                                    </span>
                                    {providers.map((provider) => {
                                      const href = buildPaymentLink(provider, receiverHandles[provider], p.pence);
                                      if (!href) return null;
                                      return (
                                        <a
                                          key={provider}
                                          href={href}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className={`inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-black tracking-widest uppercase border border-white/10 hover:border-white/20 text-white/50 hover:text-white bg-black/40 transition-colors`}
                                        >
                                          {PROVIDER_LABEL[provider]}
                                        </a>
                                      );
                                    })}
                                  </>
                                ) : null}
                                {meta && (
                                  <p className="text-[9px] text-[#39FF14]/80 tracking-wider truncate" title={new Date(meta.settledAt).toLocaleString()}>
                                    Paid {relativeTime(meta.settledAt)}
                                    {meta.settledByName ? ` · ${meta.settledByName}` : ""}
                                  </p>
                                )}
                              </div>

                              {/* Right part: Action button */}
                              <div className="shrink-0">
                                <SettlementSettleButton
                                  gameId={game.id}
                                  playerName={p.to}
                                  isAdmin={userIsAdmin}
                                  initialSettled={settledPlayers.has(p.to.toLowerCase())}
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
