import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ChevronLeft,
  Calendar,
  Clock,
  Coins,
  CircleDollarSign,
  Pizza,
  ArrowRightSquare,
  Crown,
  MapPin,
  Users,
} from "lucide-react";
import PlayerAvatar from "@/components/PlayerAvatar";
import { getHistoricalGame } from "@/lib/historical-games";
import { FOOD_PAYER } from "@/lib/local-store";

export default async function HistoricalGamePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const game = getHistoricalGame(id);
  if (!game) notFound();

  // Net = pure poker performance (cash-out minus buy-in). Food is handled
  // separately via the food-settlement section, so we don't subtract it here.
  const ranked = [...game.players]
    .map((p) => ({ ...p, net: p.cashOut - p.buyIn }))
    .sort((a, b) => b.net - a.net);

  const totalBuyIn = game.players.reduce((s, p) => s + p.buyIn, 0);
  const totalFood = game.players.reduce((s, p) => s + p.food, 0);

  function calcSettlements(players: Array<{ name: string; net: number }>) {
    const debtors = players
      .filter((p) => p.net < -0.005)
      .map((p) => ({ name: p.name, bal: Math.round(Math.abs(p.net) * 100) }))
      .sort((a, b) => b.bal - a.bal);
    const creditors = players
      .filter((p) => p.net > 0.005)
      .map((p) => ({ name: p.name, bal: Math.round(p.net * 100) }))
      .sort((a, b) => b.bal - a.bal);
    const result: { from: string; to: string; pence: number }[] = [];
    let di = 0, ci = 0;
    while (di < debtors.length && ci < creditors.length) {
      const transfer = Math.min(debtors[di].bal, creditors[ci].bal);
      result.push({ from: debtors[di].name, to: creditors[ci].name, pence: transfer });
      debtors[di].bal -= transfer;
      creditors[ci].bal -= transfer;
      if (debtors[di].bal < 1) di++;
      if (creditors[ci].bal < 1) ci++;
    }
    return result;
  }

  // Settlement is split in two so it's clear who owes what for what:
  //   1. Food — every non-FOOD_PAYER player with food > 0 owes the food payer
  //      directly (he fronted the bill on his card).
  //   2. Poker — standard min-flow settlement on pure poker net
  //      (cash-out minus buy-in, food not deducted).
  // If the food payer isn't in this session we fall back to the old combined
  // net so we don't drop food owed entirely.
  const foodPayerInGame = game.players.some((p) => p.name === FOOD_PAYER);
  const foodSettlements = foodPayerInGame
    ? game.players
        .filter((p) => p.name !== FOOD_PAYER && p.food > 0.005)
        .map((p) => ({ from: p.name, to: FOOD_PAYER, pence: Math.round(p.food * 100) }))
        .sort((a, b) => b.pence - a.pence)
    : [];
  const pokerSettlements = foodPayerInGame
    ? calcSettlements(
        game.players.map((p) => ({ name: p.name, net: p.cashOut - p.buyIn })),
      )
    : calcSettlements(ranked); // fallback: combined (cash-out − buy-in − food)

  const facts = [
    { label: "Date", value: game.date, icon: Calendar, color: "text-[#39FF14]" },
    { label: "Duration", value: game.duration, icon: Clock, color: "text-yellow-400" },
    { label: "Blinds", value: game.blinds, icon: Coins, color: "text-cyan-400" },
    { label: "Players", value: String(game.players.length), icon: Users, color: "text-purple-400" },
    { label: "Pot", value: `£${game.totalPot.toLocaleString()}`, icon: CircleDollarSign, color: "text-[#39FF14]" },
    { label: "Venue", value: game.location, icon: MapPin, color: "text-pink-400" },
  ];

  return (
    <main className="flex-1 min-h-0 flex flex-col overflow-y-auto bg-[radial-gradient(circle_at_top,_rgba(57,255,20,0.05)_0%,_rgba(14,17,23,1)_60%)] text-[#FAFAFA] px-6 xl:px-12 py-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <Link
          href="/games"
          className="inline-flex items-center gap-2 text-base text-white/50 hover:text-[#39FF14] font-semibold transition-colors"
        >
          <ChevronLeft size={18} />
          <span>Back to Games</span>
        </Link>
        <span className="font-mono text-xs tracking-widest uppercase text-white/30">
          session #{game.id}
        </span>
      </div>

      <div className="flex items-center gap-3 mb-5 shrink-0">
        <div className="p-2.5 bg-[#39FF14]/10 rounded-xl border border-[#39FF14]/20 shrink-0">
          <Calendar className="text-[#39FF14]" size={22} />
        </div>
        <div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tight uppercase leading-none">
            {game.date}
          </h1>
          <p className="text-white/50 text-sm mt-2">{game.location} · {game.duration}</p>
        </div>
      </div>

      {/* Facts */}
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-2 md:gap-3 mb-4 shrink-0">
        {facts.map((f) => (
          <div
            key={f.label}
            className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl p-3 flex items-center gap-3 hover:border-white/20 transition-colors"
          >
            <div className="p-2 rounded-lg bg-black/30 border border-white/5 shrink-0">
              <f.icon className={f.color} size={16} />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold tracking-widest uppercase text-white/40">
                {f.label}
              </p>
              <p className="text-lg md:text-xl font-black text-white truncate">{f.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Settlement table */}
      <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden flex flex-col shrink-0">
        <div className="grid grid-cols-12 gap-3 px-4 md:px-6 py-3 border-b border-white/10 bg-black/40 text-xs md:text-sm font-bold text-white/40 uppercase tracking-wider shrink-0">
          <div className="col-span-1 text-center">#</div>
          <div className="col-span-4 md:col-span-3">Player</div>
          <div className="col-span-2 text-right">Buy-in</div>
          <div className="hidden md:block col-span-2 text-right">Cash Out</div>
          <div className="hidden md:block col-span-2 text-right">Food</div>
          <div className="col-span-5 md:col-span-2 text-right text-[#39FF14]">Net</div>
        </div>

        <div className="divide-y divide-white/5">
          {ranked.map((p, i) => (
            <Link
              key={p.name}
              href={`/profile/${encodeURIComponent(p.name.toLowerCase().replace(/ /g, "-"))}`}
              className="grid grid-cols-12 gap-3 px-4 md:px-6 py-3 items-center hover:bg-white/5 transition-colors"
            >
              <div className="col-span-1 text-center font-black text-white/50">
                {i === 0 ? <Crown size={16} className="text-yellow-400 inline" /> : `#${i + 1}`}
              </div>
              <div className="col-span-4 md:col-span-3 flex items-center gap-2 md:gap-3 min-w-0">
                <PlayerAvatar
                  name={p.name}
                  size={44}
                  className="rounded-full border border-white/10 shrink-0"
                />
                <span className="font-bold text-base md:text-lg truncate">{p.name}</span>
              </div>
              <div className="col-span-2 text-right">
                <span className="text-base font-bold text-white/70">£{p.buyIn.toFixed(2)}</span>
              </div>
              <div className="hidden md:block col-span-2 text-right">
                <span className="text-base font-bold text-white/70">£{p.cashOut.toFixed(2)}</span>
              </div>
              <div className="hidden md:flex col-span-2 items-center justify-end gap-1">
                <Pizza size={11} className="text-yellow-400/60" />
                <span className="text-base font-bold text-white/70">£{p.food.toFixed(2)}</span>
              </div>
              <div className="col-span-5 md:col-span-2 text-right">
                <span
                  className={`text-lg md:text-xl font-black ${
                    p.net >= 0 ? "text-[#39FF14]" : "text-red-400"
                  }`}
                >
                  {p.net >= 0 ? "+" : ""}£{p.net.toFixed(2)}
                </span>
              </div>
            </Link>
          ))}
        </div>

        {/* Totals strip */}
        <div className="border-t border-white/10 bg-black/40 px-4 md:px-6 py-2.5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-white/40">
            <ArrowRightSquare size={11} />
            Totals
          </div>
          <div className="flex items-center gap-4 md:gap-6 text-sm">
            <span className="text-white/50">
              Buy-ins: <span className="text-white/80 font-bold">£{totalBuyIn.toFixed(2)}</span>
            </span>
            <span className="text-white/50">
              Food: <span className="text-yellow-400/80 font-bold">£{totalFood.toFixed(2)}</span>
            </span>
            <span className="text-white/50">
              Pot: <span className="text-[#39FF14] font-bold">£{game.totalPot.toFixed(2)}</span>
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4 shrink-0">
      {foodSettlements.length > 0 && (
        <div className="bg-white/5 backdrop-blur-xl border border-yellow-400/20 rounded-2xl p-4 md:p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-yellow-400/10 border border-yellow-400/20 shrink-0">
              <Pizza className="text-yellow-400" size={18} />
            </div>
            <div>
              <h3 className="text-base md:text-lg font-black tracking-widest uppercase">
                Food &mdash; paid by {FOOD_PAYER}
              </h3>
              <p className="text-sm text-white/50 mt-0.5">
                {FOOD_PAYER} fronts the food bill, so each player&rsquo;s share goes straight to {FOOD_PAYER}.
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            {foodSettlements.map((s, i) => (
              <div
                key={`food-${i}`}
                className="flex items-center gap-3 bg-black/30 border border-yellow-400/15 rounded-xl px-4 py-3"
              >
                <PlayerAvatar name={s.from} size={44} className="rounded-full border border-yellow-400/30 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white/60 truncate font-semibold">{s.from}</p>
                  <p className="text-xs text-white/30 uppercase tracking-widest">owes for food</p>
                </div>
                <span className="text-base font-black text-yellow-400 tabular-nums shrink-0">£{(s.pence / 100).toFixed(2)}</span>
                <div className="w-px h-6 bg-white/10 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white/60 truncate font-semibold">{s.to}</p>
                  <p className="text-xs text-white/30 uppercase tracking-widest">receives</p>
                </div>
                <PlayerAvatar name={s.to} size={44} className="rounded-full border border-yellow-400/40 shrink-0" />
              </div>
            ))}
          </div>
        </div>
      )}

      {pokerSettlements.length > 0 && (
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-4 md:p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-[#39FF14]/10 border border-[#39FF14]/20 shrink-0">
              <ArrowRightSquare className="text-[#39FF14]" size={18} />
            </div>
            <div>
              <h3 className="text-base md:text-lg font-black tracking-widest uppercase">Poker Settlement</h3>
              <p className="text-sm text-white/50 mt-0.5">
                {pokerSettlements.length} transfer{pokerSettlements.length !== 1 ? "s" : ""} between players to clear chip debts
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            {pokerSettlements.map((s, i) => (
              <div
                key={`poker-${i}`}
                className="flex items-center gap-3 bg-black/30 border border-white/10 rounded-xl px-4 py-3"
              >
                <PlayerAvatar name={s.from} size={44} className="rounded-full border border-red-400/30 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white/60 truncate font-semibold">{s.from}</p>
                  <p className="text-xs text-white/30 uppercase tracking-widest">pays</p>
                </div>
                <span className="text-base font-black text-red-400 tabular-nums shrink-0">£{(s.pence / 100).toFixed(2)}</span>
                <div className="w-px h-6 bg-white/10 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white/60 truncate font-semibold">{s.to}</p>
                  <p className="text-xs text-white/30 uppercase tracking-widest">receives</p>
                </div>
                <PlayerAvatar name={s.to} size={44} className="rounded-full border border-[#39FF14]/30 shrink-0" />
              </div>
            ))}
          </div>
        </div>
      )}
      </div>
    </main>
  );
}
