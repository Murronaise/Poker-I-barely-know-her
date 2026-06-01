"use client";

// Admin-only summary tile: total outstanding balances across every player,
// split into "they owe you" and "you owe them" so a glance gives the
// money-flow direction without doing maths. Renders nothing for
// non-admins (we still call the ledger fetch, but the result map is empty
// after RLS filtering, so the totals are zero and we suppress).

import { useEffect, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Wallet } from "lucide-react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isAdmin } from "@/lib/auth";
import {
  computeLedger,
  loadAllSettlements,
  type LedgerEntry,
} from "@/lib/ledger";
import { type HistoricalGame } from "@/lib/historical-games";
import { fetchEffectiveGames } from "@/lib/game-store";

type Totals = {
  owedToYouPence: number;   // total amount players owe admin
  youOwePence: number;       // total amount admin owes players
  owedToYouCount: number;
  youOweCount: number;
};

function totalsFromLedger(ledger: Map<string, LedgerEntry>): Totals {
  let owedToYouPence = 0;
  let youOwePence = 0;
  let owedToYouCount = 0;
  let youOweCount = 0;
  ledger.forEach((entry) => {
    if (entry.outstandingPence < 0) {
      owedToYouPence += -entry.outstandingPence;
      owedToYouCount += 1;
    } else if (entry.outstandingPence > 0) {
      youOwePence += entry.outstandingPence;
      youOweCount += 1;
    }
  });
  return { owedToYouPence, youOwePence, owedToYouCount, youOweCount };
}

const formatPence = (p: number) =>
  `£${(p / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function AdminLedgerSummary({ games }: { games?: HistoricalGame[] }) {
  // We resolve admin client-side using the email allow-list first, then DB
  // is_admin (matches the pattern in NavBar / games page). The DB query
  // happens off the auth listener so the tile flips on log-in/log-out
  // without a page reload.
  const [show, setShow] = useState(false);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [targetGameId, setTargetGameId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const sb = createSupabaseBrowserClient();

    const resolveAdmin = async (email?: string | null): Promise<boolean> => {
      if (!email) return false;
      if (isAdmin(email)) return true;
      const { data } = await sb
        .from("users")
        .select("is_admin")
        .eq("email", email)
        .maybeSingle();
      return data?.is_admin === true;
    };

    const refresh = async (email?: string | null) => {
      const admin = await resolveAdmin(email);
      if (cancelled) return;
      setShow(admin);
      if (!admin) {
        setTotals(null);
        setTargetGameId(null);
        return;
      }
      const [settlements, finalGames] = await Promise.all([
        loadAllSettlements(sb),
        games ? Promise.resolve(games) : fetchEffectiveGames(sb),
      ]);
      if (cancelled) return;
      const ledger = computeLedger(finalGames, settlements);
      if (cancelled) return;
      setTotals(totalsFromLedger(ledger));

      const unsettledIds = new Set<string>();
      ledger.forEach((entry) => {
        entry.unsettled.forEach((s) => {
          unsettledIds.add(s.gameId);
        });
      });
      const targetGame = finalGames.find((g) => unsettledIds.has(g.id));
      setTargetGameId(targetGame?.id ?? null);
    };

    sb.auth.getUser().then(({ data }) => refresh(data.user?.email));
    const { data: listener } = sb.auth.onAuthStateChange((_event, session) => {
      refresh(session?.user?.email);
    });

    return () => {
      cancelled = true;
      listener?.subscription.unsubscribe();
    };
  }, [games]);

  if (!show || !totals) return null;
  const { owedToYouPence, youOwePence, owedToYouCount, youOweCount } = totals;
  if (owedToYouPence === 0 && youOwePence === 0) return null;

  return (
    <Link
      href={targetGameId ? `/games/history/${targetGameId}` : "/games"}
      className="block rounded-2xl border border-cyan-400/30 bg-cyan-400/5 hover:border-cyan-400/60 hover:bg-cyan-400/10 backdrop-blur-xl p-4 mb-3 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2 rounded-lg bg-cyan-400/10 border border-cyan-400/30 shrink-0">
            <Wallet size={18} className="text-cyan-400" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-black tracking-widest uppercase text-cyan-400/90">
              Outstanding Settlements
            </p>
            <p className="text-sm text-white/60">
              {owedToYouCount + youOweCount} player{owedToYouCount + youOweCount === 1 ? "" : "s"} with open balances.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 sm:gap-6 flex-wrap">
          {owedToYouPence > 0 && (
            <div className="flex items-center gap-1.5">
              <ArrowDownLeft size={14} className="text-[#39FF14]" />
              <div>
                <p className="text-[9px] font-bold tracking-widest uppercase text-white/40">
                  They owe you
                </p>
                <p className="text-base md:text-lg font-black text-[#39FF14] tabular-nums">
                  {formatPence(owedToYouPence)}
                  <span className="text-white/30 font-medium text-xs ml-1.5">
                    · {owedToYouCount}
                  </span>
                </p>
              </div>
            </div>
          )}
          {youOwePence > 0 && (
            <div className="flex items-center gap-1.5">
              <ArrowUpRight size={14} className="text-red-400" />
              <div>
                <p className="text-[9px] font-bold tracking-widest uppercase text-white/40">
                  You owe
                </p>
                <p className="text-base md:text-lg font-black text-red-400 tabular-nums">
                  {formatPence(youOwePence)}
                  <span className="text-white/30 font-medium text-xs ml-1.5">
                    · {youOweCount}
                  </span>
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
