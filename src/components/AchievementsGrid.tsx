"use client";

// Grid of achievement badges for a player profile. Locked badges show
// their unlock criteria + a small progress hint; unlocked badges glow in
// their theme colour with the unlock date.
//
// Rendering is fully synchronous off historicalGames — no Supabase calls.

import {
  Trophy, Swords, Flame, Coins, Wallet, Timer,
  Skull, Pizza, TrendingUp, TrendingDown, Star, Award,
  Sparkles, Crown, Lock,
} from "lucide-react";
import { evaluatePlayerAchievements, type EvaluatedAchievement } from "@/lib/achievements";
import { type HistoricalGame } from "@/lib/historical-games";

const ICONS = {
  Trophy, Swords, Flame, Coins, Wallet, Timer,
  Skull, Pizza, TrendingUp, TrendingDown, Star, Award,
  Sparkles, Crown,
} as const;

// Tailwind classes per theme — kept as plain strings so the JIT picker
// includes them in the build.
const THEME_TOKENS: Record<
  EvaluatedAchievement["theme"],
  { ring: string; iconColor: string; bg: string }
> = {
  green: {
    ring: "border-[#39FF14]/40 shadow-[0_0_20px_rgba(57,255,20,0.2)]",
    iconColor: "text-[#39FF14]",
    bg: "bg-[#39FF14]/10",
  },
  cyan: {
    ring: "border-cyan-400/40 shadow-[0_0_20px_rgba(34,211,238,0.2)]",
    iconColor: "text-cyan-400",
    bg: "bg-cyan-400/10",
  },
  yellow: {
    ring: "border-yellow-400/40 shadow-[0_0_20px_rgba(250,204,21,0.2)]",
    iconColor: "text-yellow-400",
    bg: "bg-yellow-400/10",
  },
  orange: {
    ring: "border-orange-400/40 shadow-[0_0_20px_rgba(251,146,60,0.2)]",
    iconColor: "text-orange-400",
    bg: "bg-orange-400/10",
  },
  red: {
    ring: "border-red-400/40 shadow-[0_0_20px_rgba(248,113,113,0.2)]",
    iconColor: "text-red-400",
    bg: "bg-red-400/10",
  },
  purple: {
    ring: "border-purple-400/40 shadow-[0_0_20px_rgba(192,132,252,0.2)]",
    iconColor: "text-purple-400",
    bg: "bg-purple-400/10",
  },
  blue: {
    ring: "border-blue-400/40 shadow-[0_0_20px_rgba(96,165,250,0.2)]",
    iconColor: "text-blue-400",
    bg: "bg-blue-400/10",
  },
};

export default function AchievementsGrid({ playerName, games }: { playerName: string; games?: HistoricalGame[] }) {
  const badges = evaluatePlayerAchievements(playerName, games);
  // Sort: unlocked first (newest first), then locked by progress descending.
  const sorted = [...badges].sort((a, b) => {
    if (a.unlocked !== b.unlocked) return a.unlocked ? -1 : 1;
    if (a.unlocked && b.unlocked) {
      // Both unlocked — newest first.
      return (b.unlockedAt ?? "").localeCompare(a.unlockedAt ?? "");
    }
    return b.progress - a.progress;
  });

  const unlockedCount = sorted.filter((b) => b.unlocked).length;

  return (
    <section className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-4 md:p-5 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="p-1.5 rounded-lg bg-yellow-400/10 border border-yellow-400/30 shrink-0">
          <Award size={14} className="text-yellow-400" />
        </div>
        <h2 className="text-sm md:text-base font-black tracking-widest uppercase">
          Achievements
        </h2>
        <span className="text-[10px] font-bold tracking-widest uppercase text-white/30 ml-1 tabular-nums">
          {unlockedCount} / {badges.length}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 md:gap-3">
        {sorted.map((b) => {
          const Icon = ICONS[b.iconKey];
          const tokens = THEME_TOKENS[b.theme];
          return (
            <div
              key={b.id}
              className={`group rounded-xl border p-3 transition-colors ${
                b.unlocked
                  ? `bg-black/30 ${tokens.ring}`
                  : "bg-black/20 border-white/5 hover:border-white/15"
              }`}
              title={
                b.unlocked
                  ? `Unlocked ${b.unlockedAt ?? ""}`
                  : `${b.description}${
                      b.progress > 0 && b.progress < 1
                        ? ` · ${Math.round(b.progress * 100)}% there`
                        : ""
                    }`
              }
            >
              <div className="flex items-center gap-2 mb-2">
                <div
                  className={`p-1.5 rounded-md ${
                    b.unlocked ? tokens.bg : "bg-white/5"
                  }`}
                >
                  {b.unlocked ? (
                    <Icon size={14} className={tokens.iconColor} />
                  ) : (
                    <Lock size={14} className="text-white/30" />
                  )}
                </div>
                <h3
                  className={`text-xs md:text-sm font-black tracking-widest uppercase truncate ${
                    b.unlocked ? "text-white/90" : "text-white/40"
                  }`}
                >
                  {b.name}
                </h3>
              </div>
              <p
                className={`text-[10px] md:text-xs leading-snug line-clamp-3 ${
                  b.unlocked ? "text-white/60" : "text-white/30"
                }`}
              >
                {b.description}
              </p>
              {b.unlocked && b.unlockedAt && (
                <p className={`text-[9px] tracking-widest uppercase mt-2 ${tokens.iconColor}`}>
                  {b.unlockedAt}
                </p>
              )}
              {!b.unlocked && b.progress > 0 && b.progress < 1 && (
                <div className="mt-2 h-1 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-white/30 rounded-full transition-all"
                    style={{ width: `${Math.round(b.progress * 100)}%` }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
