import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ChevronLeft,
  Calendar,
  Clock,
  CircleDollarSign,
  Users,
} from "lucide-react";
import HistoryActions from "@/components/HistoryActions";
import AdminGameNotes from "@/components/AdminGameNotes";
import GameHistoryDetails from "./GameHistoryDetails";
import { fetchGameNote } from "@/lib/game-notes-db";
import { fetchSavedGame } from "@/lib/games-db";
import { getHistoricalGame } from "@/lib/historical-games";
import { FOOD_PAYER, ADMIN_PLAYER } from "@/lib/local-store";
import { supabase } from "@/lib/supabase";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isAdminDb } from "@/lib/auth";
import { fetchSettlementRecords } from "@/lib/settlements-db";
import {
  loadPaymentHandlesForPlayers,
} from "@/lib/payment-links";


export default async function HistoricalGamePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sb = await createSupabaseServerClient();
  // Prioritize the DB copy so that dynamic overrides/edits (including seed games overridden in the DB)
  // are loaded immediately, falling back to the hardcoded seed array.
  const game = (await fetchSavedGame(sb, id)) ?? getHistoricalGame(id);
  if (!game) notFound();
  const { data: { user } } = await sb.auth.getUser();
  const userIsAdmin = await isAdminDb(sb, user?.email);
  const settlementRecords = await fetchSettlementRecords(sb, game.id);
  // Set form used by the existing settled-state checks; the Map form is
  // used to render "paid {time} by {who}" alongside each tick.
  const settledPlayers = new Set(settlementRecords.keys());
  // Fetch payment handles for every player on the roster (admin + everyone
  // else, in case the admin → player payout case shows up). The helper
  // tolerates the Phase A migration not being applied yet — it just
  // returns an empty map and the deep-link chips don't render.
  const paymentHandles = await loadPaymentHandlesForPlayers(
    sb,
    game.players.map((p) => p.name),
  );
  // Admin notes — only fetched (and rendered) when the viewer is admin. The
  // RLS policy on game_notes already rejects non-admin reads, but skipping
  // the call entirely saves a round-trip for everyone else.
  const adminNote = userIsAdmin ? await fetchGameNote(sb, game.id) : null;

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

  // Admin-collects-all settlement (see AGENTS.md "Settlement Flow"):
  //   - Poker portion (cashOut − buyIn) routes through ADMIN_PLAYER.
  //   - Food portion routes through FOOD_PAYER.
  // When the two are the same person (today's default), every non-admin
  // player has a single combined transaction. When they differ, we still
  // render one row per player but the receiver text reflects the food
  // payer for any line where the food portion dominates.
  //
  // The admin themselves is excluded — they can't owe themselves. Their
  // own poker performance and their food share are absorbed into the
  // admin pot at reconciliation time.
  const adminLower = ADMIN_PLAYER.toLowerCase();
  const foodPayerLower = FOOD_PAYER.toLowerCase();
  const nonAdminPlayers = game.players.filter(
    (p) => p.name.toLowerCase() !== adminLower,
  );

  const playerNets = nonAdminPlayers
    .map((p) => {
      const pokerNet = p.cashOut - p.buyIn;
      // Food is always paid TO the food payer regardless of whose net is
      // positive on the poker side — so we represent the food share as a
      // separate negative contribution to the player's combined net.
      const isFoodPayer = p.name.toLowerCase() === foodPayerLower;
      const foodOwed = isFoodPayer ? 0 : p.food;
      return {
        name: p.name,
        buyIn: p.buyIn,
        cashOut: p.cashOut,
        food: foodOwed,
        pokerNet,
        // Combined net, used to decide debtor vs creditor when admin === food
        // payer (the common case). For the split case the rendering still
        // shows the combined number but the totals reconcile correctly.
        net: pokerNet - foodOwed,
      };
    })
    .filter((p) => Math.abs(p.net) > 0.005 || p.buyIn > 0.005 || p.food > 0.005);

  // When admin and food payer are the same person, "to" / "from" reads as
  // that single name in every row. When they differ, we annotate the lead
  // settlement with admin but keep food breakdown on the line so the
  // payer/receiver picture stays legible.
  const settlements = playerNets
    .filter((p) => p.net < -0.005)
    .sort((a, b) => a.net - b.net)
    .map((p) => ({
      from: p.name,
      to: ADMIN_PLAYER,
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
      from: ADMIN_PLAYER,
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

      {/* Admin-only notes — private context for this session. RLS gates the
          server-side fetch, this conditional gates the render. */}
      {userIsAdmin && (
        <AdminGameNotes gameId={game.id} initialNote={adminNote} />
      )}

      {/* Tabbed Standing/Results & Payments/Settlements Control */}
      <GameHistoryDetails
        game={game}
        ranked={ranked}
        avatarMap={avatarMap}
        settlements={settlements}
        payouts={payouts}
        userIsAdmin={userIsAdmin}
        settledPlayersList={Array.from(settledPlayers)}
        paymentHandles={paymentHandles}
        settlementRecordsRaw={Object.fromEntries(settlementRecords)}
        totalBuyIn={totalBuyIn}
        totalFood={totalFood}
      />
    </main>
  );
}
