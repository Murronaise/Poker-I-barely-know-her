"use client";

// Auto-surfacing banner that links to the yearly recap page when there's
// data worth recapping. We show it any time the previous calendar year has
// historical sessions (so end-of-year revisits feel natural) and during
// December for the current year (so it's hot off the press as you play
// the last sessions of the year).
//
// Self-suppresses when there's nothing to recap to avoid a dead link.

import Link from "next/link";
import { useMemo } from "react";
import { Sparkles, ArrowRight } from "lucide-react";
import { historicalGames } from "@/lib/historical-games";

export default function YearlyRecapBanner() {
  const target = useMemo<{ year: number; subtitle: string } | null>(() => {
    const now = new Date();
    const thisYear = now.getFullYear();
    const lastYear = thisYear - 1;

    const has = (year: number) =>
      historicalGames.some((g) => {
        const d = new Date(g.date);
        return Number.isFinite(d.getTime()) && d.getFullYear() === year;
      });

    // December of the current year — surface this year's recap so the dec
    // sessions appear right next to it. Otherwise show last year's recap
    // for January-November.
    if (now.getMonth() === 11 && has(thisYear)) {
      return { year: thisYear, subtitle: "This year so far" };
    }
    if (has(lastYear)) {
      return { year: lastYear, subtitle: "Year in review" };
    }
    return null;
  }, []);

  if (!target) return null;

  return (
    <Link
      href={`/recap/${target.year}`}
      className="block rounded-2xl border border-yellow-400/30 bg-gradient-to-br from-yellow-400/10 via-orange-400/5 to-cyan-400/5 hover:border-yellow-400/60 backdrop-blur-xl p-4 mb-3 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400/60"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2 rounded-lg bg-yellow-400/15 border border-yellow-400/40 shrink-0">
            <Sparkles size={18} className="text-yellow-400" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-black tracking-widest uppercase text-yellow-400/90">
              {target.subtitle}
            </p>
            <p className="text-base md:text-lg font-black truncate">
              {target.year} in Poker
            </p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1 text-[10px] font-black tracking-widest uppercase text-yellow-400 shrink-0">
          Open
          <ArrowRight size={12} />
        </span>
      </div>
    </Link>
  );
}
