import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ChevronLeft,
  Calendar,
  Clock,
  CircleDollarSign,
  Pizza,
  ArrowRightSquare,
  Crown,
  Users,
} from "lucide-react";
import PlayerAvatar from "@/components/PlayerAvatar";
import CollapsibleSection from "@/components/CollapsibleSection";
import HistoryActions from "@/components/HistoryActions";
import SettlementSettleButton from "@/components/SettlementSettleButton";
import { getHistoricalGame } from "@/lib/historical-games";
import { FOOD_PAYER } from "@/lib/local-store";
import { supabase } from "@/lib/supabase";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isAdminDb } from "@/lib/auth";
import { fetchSettledPlayers } from "@/lib/settlements-db";

export default async function HistoricalGamePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const game = getHistoricalGame(id);
  if (!game) notFound();

  const sb = await createSupabaseServerClient();
  const { data: { user } } = await sb.auth.getUser();
  const userIsAdmin = await isAdminDb(sb, user?.email);
  const settledPlayers = await fetchSettledPlayers(sb, game.id);

  // Fetch avatar URLs from Supabase
  const { data: playerRows } = await supabase
    .from("players")
    .select("name, avatar_url")
    .in("name", game.players.map(p => p.name));
  const avatarMap: Record<string, string> = {};
  (playerRows ?? []).forEach(r => { if (r.avatar_url) avatarMap[r.name] = r.avatar_url; });

  // Net = pure poker performance (cash-out minus buy-in). Food is handled
  // separately via the food-settlement section, so we don't subtract it here.
  const ranked = [...game.players]
    .map((p) => ({ ...p, net: p.cashOut - p.buyIn }))
    .sort((a, b) => b.net - a.net);

  const totalBuyIn = game.players.reduce((s, p) => s + p.buyIn, 0);
  const totalFood = game.players.reduce((s, p) => s + p.food, 0);

  // Single end-of-game settlement. Each player's net = cashOut − buyIn − food.
  // Positive ⇒ admin pays them; negative ⇒ they pay admin. One transaction
  // per player, settles the entire night in a single transfer either way.
  // Rebuys are already folded into buyIn by the live tracker.
  const nonAdminPlayers = game.players.filter((p) => p.name !== FOOD_PAYER);

  const playerNets = nonAdminPlayers
    .map((p) => ({
      name: p.name,
      buyIn: p.buyIn,
      cashOut: p.cashOut,
      food: p.food,
      net: p.cashOut - p.buyIn - p.food,
    }))
    .filter((p) => Math.abs(p.net) > 0.005 || p.buyIn > 0.005 || p.food > 0.005);

  const settlements = playerNets
    .filter((p) => p.net < -0.005)
    .sort((a, b) => a.net - b.net)
    .map((p) => ({
      from: p.name,
      to: FOOD_PAYER,
      pence: Math.round(-p.net * 100),
      buyInPence: Math.round(p.buyIn * 100),
      cashOutPence: Math.round(p.cashOut * 100),
      foodPence: Math.round(p.food * 100),
    }));

  const payouts = playerNets
    .filter((p) => p.net > 0.005)
    .sort((a, b) => b.net - a.net)
    .map((p) => ({
      to: p.name,
      from: FOOD_PAYER,
      pence: Math.round(p.net * 100),
      buyInPence: Math.round(p.buyIn * 100),
      cashOutPence: Math.round(p.cashOut * 100),
      foodPence: Math.round(p.food * 100),
    }));

  const facts = [
    { label: "Date", value: game.date, icon: Calendar, color: "text-[#39FF14]" },
    { label: "Duration", value: game.duration, icon: Clock, color: "text-yellow-400" },
    { label: "Players", value: String(game.players.length), icon: Users, color: "text-purple-400" },
    { label: "Pot", value: `£${game.totalPot.toLocaleString()}`, icon: CircleDollarSign, color: "text-[#39FF14]" },
  ];

  return (
    <main className="flex-1 flex flex-col md:min-h-0 md:overflow-y-auto bg-[radial-gradient(circle_at_top,_rgba(57,255,20,0.05)_0%,_rgba(14,17,23,1)_60%)] text-[#FAFAFA] px-4 md:px-6 xl:px-12 py-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <Link
          href="/games"
          className="inline-flex items-center gap-2 text-base text-white/50 hover:text-[#39FF14] font-semibold transition-colors"
        >
          <ChevronLeft size={18} />
          <span>Back to Games</span>
        </Link>
        <div className="flex items-center gap-4">
          <HistoryActions
            gameId={game.id}
            isAdmin={userIsAdmin}
            game={game}
            requiredPayers={[
              ...settlements.map((s) => s.from),
              ...payouts.map((p) => p.to),
            ]}
            initialSettledKeys={Array.from(settledPlayers)}
          />
          <span className="font-mono text-xs tracking-widest uppercase text-white/30">
            session #{game.id}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-5 shrink-0">
        <div className="p-2.5 bg-[#39FF14]/10 rounded-xl border border-[#39FF14]/20 shrink-0">
          <Calendar className="text-[#39FF14]" size={22} />
        </div>
        <div>
          <h1 className="text-2xl md:text-4xl font-black tracking-tight uppercase leading-none">
            {game.date}
          </h1>
          <p className="text-white/50 text-sm mt-2">{game.location} · {game.duration}</p>
        </div>
      </div>

      {/* Facts */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3 mb-4 shrink-0">
        {facts.map((f) => (
          <div
            key={f.label}
            className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl p-2.5 flex items-center gap-2.5 hover:border-white/20 transition-colors"
          >
            <div className="p-2 rounded-lg bg-black/30 border border-white/5 shrink-0">
              <f.icon className={f.color} size={16} />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold tracking-widest uppercase text-white/40">
                {f.label}
              </p>
              <p className="text-sm md:text-base lg:text-lg font-black text-white truncate">{f.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Settlement table */}
      <CollapsibleSection title="Results" icon={<Crown size={18} className="text-yellow-400"/>} defaultOpen={false}>
        <div className="overflow-hidden flex flex-col">
          <div className="grid grid-cols-12 gap-3 px-4 md:px-6 py-3 border-b border-white/10 bg-black/40 text-xs md:text-sm font-bold text-white/40 uppercase tracking-wider shrink-0">
            <div className="col-span-1 text-center">#</div>
            <div className="col-span-4 md:col-span-3">Player</div>
            <div className="col-span-2 text-right">Buy-in</div>
            <div className="hidden md:block col-span-2 text-right">Cash Out</div>
            <div className="hidden md:block col-span-2 text-right">Food</div>
            <div className="col-span-5 md:col-span-2 text-right text-[#39FF14]">Profit</div>
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
                  avatarUrl={avatarMap[p.name]}
                  size={44}
                  className="rounded-full border border-white/10 shrink-0"
                />
                <span className="font-bold text-sm md:text-base lg:text-lg truncate">{p.name}</span>
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
                  className={`text-base md:text-lg font-black ${
                    p.net >= 0 ? "text-[#39FF14]" : "text-red-400"
                  }`}
                >
                  {p.net >= 0 ? "+" : ""}£{p.net.toFixed(2)}
                </span>
              </div>
              </Link>
            ))}
          </div>

          {/* Totals strip — on mobile we stack the totals onto their own row
              under the "Totals" caption and let them split across the row with
              justify-between so the values don't crowd each other. From sm up
              the original inline layout returns. */}
          <div className="border-t border-white/10 bg-black/40 px-4 md:px-6 py-2.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 shrink-0">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-white/40 shrink-0">
              <ArrowRightSquare size={11} />
              Totals
            </div>
            <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-6 text-sm w-full sm:w-auto">
              <span className="text-white/50 truncate">
                Buy-ins <span className="text-white/80 font-bold tabular-nums">£{totalBuyIn.toFixed(2)}</span>
              </span>
              <span className="text-white/50 truncate">
                Food <span className="text-yellow-400/80 font-bold tabular-nums">£{totalFood.toFixed(2)}</span>
              </span>
              <span className="text-white/50 truncate">
                Pot <span className="text-[#39FF14] font-bold tabular-nums">£{game.totalPot.toFixed(2)}</span>
              </span>
            </div>
          </div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Settlement" icon={<ArrowRightSquare size={18} className="text-[#39FF14]"/>} defaultOpen={false} className="mt-4">
        <div className="flex flex-col gap-2">
          {settlements.length === 0 && payouts.length === 0 && (
            <p className="text-sm text-white/40 py-4 text-center">No settlement required</p>
          )}

          {settlements.map((s, i) => (
            <div
              key={`owe-${i}`}
              className="bg-black/40 border border-red-400/20 rounded-lg p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3"
            >
              <div className="flex items-center gap-3 min-w-0">
                <PlayerAvatar name={s.from} avatarUrl={avatarMap[s.from]} size={40} className="rounded-full border border-red-400/30 shrink-0" />
                <div className="min-w-0 flex-1 flex flex-col gap-0.5">
                  <p className="text-sm font-bold text-white truncate">{s.from}</p>
                  <p className="text-xs text-red-400/70 uppercase tracking-widest font-semibold truncate">owes {s.to}</p>
                </div>
                <p className="text-lg font-black text-red-400 tabular-nums shrink-0 sm:hidden">
                  £{(s.pence / 100).toFixed(2)}
                </p>
              </div>

              <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                <p className="text-xs text-white/70 tabular-nums">
                  {[
                    s.buyInPence > 0 ? `Buy-in £${(s.buyInPence / 100).toFixed(2)}` : null,
                    s.cashOutPence > 0 ? `Cash-out £${(s.cashOutPence / 100).toFixed(2)}` : null,
                    s.foodPence > 0 ? `Food £${(s.foodPence / 100).toFixed(2)}` : null,
                  ].filter(Boolean).join(" · ")}
                </p>
                <p className="text-lg font-black text-red-400 tabular-nums hidden sm:block">
                  £{(s.pence / 100).toFixed(2)}
                </p>
                <SettlementSettleButton
                  gameId={game.id}
                  playerName={s.from}
                  isAdmin={userIsAdmin}
                  initialSettled={settledPlayers.has(s.from.toLowerCase())}
                />
              </div>
            </div>
          ))}

          {payouts.map((p, i) => (
            <div
              key={`pay-${i}`}
              className="bg-black/40 border border-[#39FF14]/20 rounded-lg p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3"
            >
              <div className="flex items-center gap-3 min-w-0">
                <PlayerAvatar name={p.to} avatarUrl={avatarMap[p.to]} size={40} className="rounded-full border border-[#39FF14]/30 shrink-0" />
                <div className="min-w-0 flex-1 flex flex-col gap-0.5">
                  <p className="text-sm font-bold text-white truncate">{p.to}</p>
                  <p className="text-xs text-[#39FF14]/80 uppercase tracking-widest font-semibold truncate">receives from {p.from}</p>
                </div>
                <p className="text-lg font-black text-[#39FF14] tabular-nums shrink-0 sm:hidden">
                  £{(p.pence / 100).toFixed(2)}
                </p>
              </div>

              <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                <p className="text-xs text-white/70 tabular-nums">
                  {[
                    p.buyInPence > 0 ? `Buy-in £${(p.buyInPence / 100).toFixed(2)}` : null,
                    p.cashOutPence > 0 ? `Cash-out £${(p.cashOutPence / 100).toFixed(2)}` : null,
                    p.foodPence > 0 ? `Food £${(p.foodPence / 100).toFixed(2)}` : null,
                  ].filter(Boolean).join(" · ")}
                </p>
                <p className="text-lg font-black text-[#39FF14] tabular-nums hidden sm:block">
                  £{(p.pence / 100).toFixed(2)}
                </p>
                <SettlementSettleButton
                  gameId={game.id}
                  playerName={p.to}
                  isAdmin={userIsAdmin}
                  initialSettled={settledPlayers.has(p.to.toLowerCase())}
                />
              </div>
            </div>
          ))}
        </div>
      </CollapsibleSection>
    </main>
  );
}
