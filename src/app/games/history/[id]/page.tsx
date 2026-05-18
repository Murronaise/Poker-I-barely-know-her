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
import AdminGameNotes from "@/components/AdminGameNotes";
import { fetchGameNote } from "@/lib/game-notes-db";
import GamePhotos from "@/components/GamePhotos";
import { getHistoricalGame } from "@/lib/historical-games";
import { FOOD_PAYER, ADMIN_PLAYER } from "@/lib/local-store";
import { supabase } from "@/lib/supabase";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isAdminDb } from "@/lib/auth";
import { fetchSettlementRecords, type SettlementRecord } from "@/lib/settlements-db";
import {
  activeProviders,
  buildPaymentLink,
  getHandlesFor,
  loadPaymentHandlesForPlayers,
  PROVIDER_LABEL,
  PROVIDER_ACCENT,
} from "@/lib/payment-links";

// Cheap relative-time formatter for the "paid 2h ago" subtitle. We don't
// pull in date-fns or dayjs for this single use; rounding to a coarse unit
// is good enough.
function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "just now";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  return new Date(iso).toLocaleDateString();
}

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
  const settlementRecords = await fetchSettlementRecords(sb, game.id);
  // Set form used by the existing settled-state checks; the Map form is
  // used to render "paid {time} by {who}" alongside each tick.
  const settledPlayers = new Set(settlementRecords.keys());
  const settlementMetaFor = (playerName: string): SettlementRecord | null =>
    settlementRecords.get(playerName.toLowerCase()) ?? null;
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

      {/* Chip-stack / table photos — public read, upload gated to signed-in
          users. Players list drives the per-player attach affordance so
          each chip-stack shot gets tagged with whose stack it is. */}
      <GamePhotos
        gameId={game.id}
        canUpload={Boolean(user)}
        players={game.players.map((p) => ({ name: p.name, avatarUrl: avatarMap[p.name] }))}
      />


      {/* Settlement table */}
      <CollapsibleSection title="Results" icon={<Crown size={18} className="text-yellow-400"/>} defaultOpen={false}>
        <div className="overflow-hidden flex flex-col">
          {/* Portrait phones can't fit six columns side by side, so the
              previous design hid Cash Out + Food behind a md: breakpoint —
              which meant you couldn't see whose food cost what without an
              iPad. Wrapping the whole grid in horizontal scroll with a
              min-width gives every column a fair share of space and the
              user can pan right to reach the rest. Match the live-game
              finalized-results pattern that already does this. */}
          <div className="overflow-x-auto">
            <div className="min-w-[720px]">
              <div className="grid grid-cols-12 gap-3 px-4 md:px-6 py-3 border-b border-white/10 bg-black/40 text-xs md:text-sm font-bold text-white/40 uppercase tracking-wider shrink-0">
                <div className="col-span-1 text-center">#</div>
                <div className="col-span-3">Player</div>
                <div className="col-span-2 text-right">Buy-in</div>
                <div className="col-span-2 text-right">Cash Out</div>
                <div className="col-span-2 text-right">Food</div>
                <div className="col-span-2 text-right text-[#39FF14]">Profit</div>
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
                  <div className="col-span-3 flex items-center gap-2 md:gap-3 min-w-0">
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
                  <div className="col-span-2 text-right">
                    <span className="text-base font-bold text-white/70">£{p.cashOut.toFixed(2)}</span>
                  </div>
                  <div className="col-span-2 flex items-center justify-end gap-1">
                    <Pizza size={11} className="text-yellow-400/60" />
                    <span className="text-base font-bold text-white/70">£{p.food.toFixed(2)}</span>
                  </div>
                  <div className="col-span-2 text-right">
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
            </div>
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

          {settlements.map((s, i) => {
            // The debtor pays the receiver, so we surface the receiver's
            // payment handles. Pre-fill the amount so a tap lands on a
            // payment screen with the right number already typed.
            const receiverHandles = getHandlesFor(paymentHandles, s.to);
            const providers = activeProviders(receiverHandles);
            const meta = settlementMetaFor(s.from);
            return (
            <div
              key={`owe-${i}`}
              className="bg-black/40 border border-red-400/20 rounded-lg p-3 flex flex-col gap-2"
            >
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <PlayerAvatar name={s.from} avatarUrl={avatarMap[s.from]} size={40} className="rounded-full border border-red-400/30 shrink-0" />
                <div className="min-w-0 flex-1 flex flex-col gap-0.5">
                  <p className="text-sm font-bold text-white truncate">{s.from}</p>
                  <p className="text-xs text-red-400/70 uppercase tracking-widest font-semibold truncate">owes {s.to}</p>
                  {meta && (
                    <p className="text-[10px] text-[#39FF14]/80 tracking-wider truncate" title={new Date(meta.settledAt).toLocaleString()}>
                      Paid {relativeTime(meta.settledAt)}
                      {meta.settledByName ? ` · by ${meta.settledByName}` : ""}
                    </p>
                  )}
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

              {providers.length > 0 && !meta && (
                <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-white/5">
                  <span className="text-[10px] font-bold tracking-widest uppercase text-white/40 mr-1">
                    Pay {s.to}:
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
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-black tracking-widest uppercase border transition-colors bg-gradient-to-br ${PROVIDER_ACCENT[provider]}`}
                      >
                        {PROVIDER_LABEL[provider]}
                      </a>
                    );
                  })}
                </div>
              )}
            </div>
            );
          })}

          {payouts.map((p, i) => {
            const receiverHandles = getHandlesFor(paymentHandles, p.to);
            const providers = activeProviders(receiverHandles);
            const meta = settlementMetaFor(p.to);
            return (
            <div
              key={`pay-${i}`}
              className="bg-black/40 border border-[#39FF14]/20 rounded-lg p-3 flex flex-col gap-2"
            >
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <PlayerAvatar name={p.to} avatarUrl={avatarMap[p.to]} size={40} className="rounded-full border border-[#39FF14]/30 shrink-0" />
                <div className="min-w-0 flex-1 flex flex-col gap-0.5">
                  <p className="text-sm font-bold text-white truncate">{p.to}</p>
                  <p className="text-xs text-[#39FF14]/80 uppercase tracking-widest font-semibold truncate">receives from {p.from}</p>
                  {meta && (
                    <p className="text-[10px] text-[#39FF14]/80 tracking-wider truncate" title={new Date(meta.settledAt).toLocaleString()}>
                      Paid {relativeTime(meta.settledAt)}
                      {meta.settledByName ? ` · by ${meta.settledByName}` : ""}
                    </p>
                  )}
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

              {providers.length > 0 && !meta && (
                <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-white/5">
                  <span className="text-[10px] font-bold tracking-widest uppercase text-white/40 mr-1">
                    Pay {p.to}:
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
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-black tracking-widest uppercase border transition-colors bg-gradient-to-br ${PROVIDER_ACCENT[provider]}`}
                      >
                        {PROVIDER_LABEL[provider]}
                      </a>
                    );
                  })}
                </div>
              )}
            </div>
            );
          })}
        </div>
      </CollapsibleSection>
    </main>
  );
}
