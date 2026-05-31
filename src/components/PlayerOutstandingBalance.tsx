"use client";

// Per-player outstanding-balance tile, suitable for embedding on the
// profile page. Walks every historical session against the
// game_settlements table to compute "how much do you still owe / are you
// owed across the whole roster's history?".
//
// Renders nothing when the player is all-square or has no history — we
// don't want a "£0 outstanding" stub cluttering profiles for new accounts.

import { useEffect, useState } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  ledgerEntryFor,
  loadAllSettlements,
  computeLedger,
  formatLedgerPence,
  type LedgerEntry,
} from "@/lib/ledger";
import { type HistoricalGame } from "@/lib/historical-games";
import { fetchEffectiveGames } from "@/lib/game-store";
import { ADMIN_PLAYER } from "@/lib/local-store";
import { Coins, Receipt } from "lucide-react";

export default function PlayerOutstandingBalance({
  playerName,
  games,
}: {
  playerName: string;
  games?: HistoricalGame[];
}) {
  const [entry, setEntry] = useState<LedgerEntry | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const sb = createSupabaseBrowserClient();
      const [settlements, fetchedGames] = await Promise.all([
        loadAllSettlements(sb),
        games ? Promise.resolve(games) : fetchEffectiveGames(sb),
      ]);
      if (cancelled) return;
      const ledger = computeLedger(fetchedGames, settlements);
      const e = ledgerEntryFor(ledger, playerName);
      if (cancelled) return;
      setEntry(e);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [playerName, games]);

  // Suppress the tile entirely for the admin profile (no outstanding to
  // surface — they're the hub) and for genuinely-clean players. Loading
  // and zero-balance both return nothing so the layout doesn't jump.
  if (playerName.toLowerCase() === ADMIN_PLAYER.toLowerCase()) return null;
  if (loading) return null;
  if (!entry || Math.abs(entry.outstandingPence) < 0.5) return null;

  const owesAdmin = entry.outstandingPence < 0;
  const accent = owesAdmin
    ? "border-red-400/30 bg-red-400/5"
    : "border-[#39FF14]/30 bg-[#39FF14]/5";
  const labelColor = owesAdmin ? "text-red-400" : "text-[#39FF14]";

  return (
    <section className={`rounded-2xl border ${accent} backdrop-blur-xl p-4 md:p-5 mb-4`}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <div className={`p-1.5 rounded-lg bg-black/30 border border-white/10 shrink-0`}>
            <Coins size={14} className={labelColor} />
          </div>
          <h2 className="text-sm md:text-base font-black tracking-widest uppercase">
            Running balance
          </h2>
        </div>
        <p className={`text-2xl md:text-3xl font-black tabular-nums ${labelColor}`}>
          {formatLedgerPence(entry.outstandingPence)}
        </p>
      </div>
      <p className="text-xs text-white/50 mt-2">
        {owesAdmin
          ? `${entry.displayName} still owes ${ADMIN_PLAYER} this amount across ${entry.unsettled.length} session${entry.unsettled.length === 1 ? "" : "s"}.`
          : `${ADMIN_PLAYER} still owes ${entry.displayName} this amount across ${entry.unsettled.length} session${entry.unsettled.length === 1 ? "" : "s"}.`}
      </p>

      {entry.unsettled.length > 0 && (
        <ul className="mt-3 pt-3 border-t border-white/5 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {entry.unsettled.slice(0, 6).map((s) => (
            <li key={s.gameId}>
              <Link
                href={`/games/history/${s.gameId}`}
                className="flex items-center justify-between gap-2 text-xs text-white/60 hover:text-white hover:bg-white/5 rounded-md px-2 py-1.5 transition-colors group"
              >
                <span className="inline-flex items-center gap-1.5 min-w-0">
                  <Receipt size={11} className="opacity-50 shrink-0" />
                  <span className="truncate">{s.date}</span>
                </span>
                <span className={`font-bold tabular-nums shrink-0 ${labelColor}`}>
                  {formatLedgerPence(s.pence)}
                </span>
              </Link>
            </li>
          ))}
          {entry.unsettled.length > 6 && (
            <li className="text-[10px] text-white/30 px-2 py-1 col-span-full">
              + {entry.unsettled.length - 6} more session
              {entry.unsettled.length - 6 === 1 ? "" : "s"} unsettled.
            </li>
          )}
        </ul>
      )}
    </section>
  );
}
