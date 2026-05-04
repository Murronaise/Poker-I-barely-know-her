import Link from "next/link";
import { Trophy, ChevronLeft, Crown, Medal, ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";
import PlayerAvatar from "@/components/PlayerAvatar";
import { supabase } from "@/lib/supabase";
import {
  leaderboardCategories,
  leaderboardCategoryOrder,
} from "@/lib/leaderboard-data";

export default async function LeaderboardsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const resolvedParams = await searchParams;
  const requested = resolvedParams.category || "overall-leader";
  const category =
    leaderboardCategories[requested] ?? leaderboardCategories["overall-leader"];

  const avatarMap: Record<string, string> = {};
  try {
    const { data } = await supabase.from("players").select("name, avatar_url");
    if (data) {
      data.forEach((p) => {
        if (p.avatar_url) avatarMap[p.name] = p.avatar_url;
      });
    }
  } catch {
    // ignore
  }

  const podium = category.rows.slice(0, 3);
  const rest = category.rows.slice(3);

  // Render podium in visual order (2nd, 1st, 3rd) instead of using CSS `order`.
  // CSS order shuffles paint but leaves DOM at 1-2-3, which means tab order
  // and screen-reader announcement disagree with what the user sees.
  const podiumVisual =
    podium.length >= 3
      ? [
          podium.find((p) => p.rank === 2),
          podium.find((p) => p.rank === 1),
          podium.find((p) => p.rank === 3),
        ].filter((p): p is (typeof podium)[number] => Boolean(p))
      : podium;

  return (
    <main className="flex-1 flex flex-col md:min-h-0 md:overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(57,255,20,0.05)_0%,_rgba(14,17,23,1)_60%)] text-[#FAFAFA] px-4 md:px-6 xl:px-12 py-5">
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-base text-white/50 hover:text-[#39FF14] font-semibold transition-colors mb-4 shrink-0"
      >
        <ChevronLeft size={18} />
        <span>Back to Dashboard</span>
      </Link>

      <div className="flex items-center gap-3 mb-5 shrink-0">
        <div className="p-2.5 bg-[#39FF14]/10 rounded-xl border border-[#39FF14]/20 shrink-0">
          <Trophy className="text-[#39FF14]" size={22} />
        </div>
        <div>
          <h1 className="text-2xl md:text-4xl font-black tracking-tight uppercase leading-none">
            {category.title}
          </h1>
          <p className="text-white/50 text-base mt-2">{category.subtitle}</p>
        </div>
      </div>

      {/* Category Switcher — sticky on mobile so users can change category
          without scrolling back to the top. Becomes static again from md up. */}
      <nav
        aria-label="Leaderboard categories"
        className="sticky top-[60px] md:top-0 md:static -mx-4 md:mx-0 px-4 md:px-0 py-2 md:py-0 mb-4 shrink-0 z-30 bg-[#0E1117]/85 md:bg-transparent backdrop-blur-md md:backdrop-blur-0 border-b border-white/5 md:border-0"
      >
        <div className="flex md:flex-wrap gap-1.5 overflow-x-auto md:overflow-visible [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {leaderboardCategoryOrder.map((slug) => {
            const c = leaderboardCategories[slug];
            const active = slug === category.slug;
            return (
              <Link
                key={slug}
                href={`/leaderboards?category=${slug}`}
                aria-current={active ? "page" : undefined}
                className={`shrink-0 min-h-9 inline-flex items-center text-xs font-bold tracking-widest uppercase px-3 py-1.5 rounded-md border transition-colors ${
                  active
                    ? "bg-[#39FF14]/15 border-[#39FF14]/60 text-[#39FF14]"
                    : "bg-black/30 border-white/10 text-white/60 hover:border-[#39FF14]/40 hover:text-[#39FF14]"
                }`}
              >
                {c.title}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Top 3 Podium — DOM is rendered in *visual* order (2-1-3) so tab order
          and screen-reader announcement match what's on screen. Extra top
          padding keeps the crown above #1 from overlapping the switcher. */}
      {podiumVisual.length > 0 && (
        <div className="grid grid-cols-3 gap-2 md:gap-4 mb-4 mt-6 md:mt-8 items-end shrink-0">
          {podiumVisual.map((row) => {
            const realRank = row.rank;
            const heightClass =
              realRank === 1
                ? "h-[210px] sm:h-[240px] md:h-[270px]"
                : realRank === 2
                  ? "h-[190px] sm:h-[215px] md:h-[240px]"
                  : "h-[180px] sm:h-[200px] md:h-[225px]";
            const accent =
              realRank === 1
                ? "border-yellow-400/60 shadow-[0_0_40px_rgba(250,204,21,0.3)] bg-gradient-to-b from-yellow-400/15 to-transparent"
                : realRank === 2
                  ? "border-gray-300/40 bg-gradient-to-b from-gray-300/10 to-transparent"
                  : "border-orange-400/40 bg-gradient-to-b from-orange-400/10 to-transparent";
            const rankColor =
              realRank === 1
                ? "text-yellow-400"
                : realRank === 2
                  ? "text-gray-300"
                  : "text-orange-400";
            const borderColor =
              realRank === 1
                ? "border-yellow-400"
                : realRank === 2
                  ? "border-gray-300"
                  : "border-orange-400";
            return (
              <Link
                key={row.player}
                href={`/profile/${encodeURIComponent(row.player.toLowerCase().replace(/ /g, "-"))}`}
                aria-label={`Rank ${realRank}: ${row.player} — ${row.value}`}
                className="group focus:outline-none focus-visible:ring-2 focus-visible:ring-[#39FF14]/60 rounded-2xl"
              >
                <div
                  className={`relative rounded-2xl border ${accent} ${heightClass} flex flex-col items-center p-3 md:p-4 pt-6 md:pt-7 gap-2 transition-transform group-hover:-translate-y-1`}
                >
                  <div className="absolute -top-5 md:-top-6 left-1/2 -translate-x-1/2 flex items-center justify-center">
                    {realRank === 1 ? (
                      <Crown
                        className="text-yellow-400 drop-shadow-[0_0_12px_rgba(250,204,21,0.7)]"
                        size={26}
                      />
                    ) : (
                      <Medal className={rankColor} size={22} />
                    )}
                  </div>

                  {/* Layout: avatar centred at top, rank + win-rate flanking, name + value below.
                      Stays compact on phones; expands on tablet+. */}
                  <div className="flex flex-col items-center w-full gap-1.5 sm:gap-2 flex-1 min-h-0">
                    <PlayerAvatar
                      name={row.player}
                      avatarUrl={avatarMap[row.player]}
                      size={realRank === 1 ? 88 : 72}
                      className={`sm:hidden rounded-full border-[3px] shadow-lg ${borderColor} ${
                        realRank === 1
                          ? "shadow-yellow-400/30"
                          : realRank === 2
                            ? "shadow-gray-300/20"
                            : "shadow-orange-400/20"
                      }`}
                    />
                    <PlayerAvatar
                      name={row.player}
                      avatarUrl={avatarMap[row.player]}
                      size={realRank === 1 ? 128 : 104}
                      className={`hidden sm:block rounded-full border-[3px] shadow-lg ${borderColor} ${
                        realRank === 1
                          ? "shadow-yellow-400/30"
                          : realRank === 2
                            ? "shadow-gray-300/20"
                            : "shadow-orange-400/20"
                      }`}
                    />
                    {/* One row: rank ‖ name ‖ win-rate. Name takes remaining
                        flex space and truncates if the card gets narrow. */}
                    <div className="flex items-center justify-between w-full gap-2 mt-auto">
                      <div className="flex flex-col items-center shrink-0">
                        <span className={`text-base sm:text-xl font-black leading-none ${rankColor}`}>
                          #{realRank}
                        </span>
                        <span className="text-[9px] sm:text-[10px] text-white/40 font-bold uppercase tracking-widest mt-0.5">
                          {row.sessions} sess
                        </span>
                      </div>
                      <p className="font-black text-white text-sm sm:text-base text-center truncate flex-1 min-w-0 px-1">
                        {row.player}
                      </p>
                      <div className="flex flex-col items-center shrink-0">
                        <span className="text-sm sm:text-base font-bold text-cyan-400 leading-none">
                          {row.winRate}
                        </span>
                        <span className="text-[9px] sm:text-[10px] text-white/40 font-bold uppercase tracking-widest mt-0.5">
                          win
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Value at bottom */}
                  <div className="w-full text-center border-t border-white/10 pt-2 shrink-0">
                    <p
                      className={`text-base md:text-lg font-black ${
                        row.value.startsWith("-") ? "text-red-400" : "text-[#39FF14]"
                      }`}
                    >
                      {row.value}
                    </p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Remaining rows */}
      {rest.length > 0 && (
        <div className="md:flex-1 md:min-h-0 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl flex flex-col md:overflow-hidden">
          {/* Header is hidden under md — phones get a card-row layout below
              and column labels would just be visual noise. */}
          <div
            role="row"
            className="hidden md:grid grid-cols-12 gap-3 px-4 py-2.5 border-b border-white/10 bg-black/20 text-xs font-bold text-white/40 uppercase tracking-widest shrink-0"
          >
            <div className="col-span-2 text-center">Rank</div>
            <div className="col-span-4">Player</div>
            <div className="col-span-2 text-right">{category.metricLabel}</div>
            <div className="col-span-2 text-center">Win Rate</div>
            <div className="col-span-2 text-center">Sessions</div>
          </div>

          <div className="md:flex-1 md:min-h-0 md:overflow-auto divide-y divide-white/5">
            {rest.map((row) => {
              const trendLabel =
                row.trendDirection === "up"
                  ? "trending up"
                  : row.trendDirection === "down"
                    ? "trending down"
                    : "no change";
              const valueIsNegative = row.value.startsWith("-");
              return (
                <Link
                  key={row.rank}
                  href={`/profile/${encodeURIComponent(row.player.toLowerCase().replace(/ /g, "-"))}`}
                  aria-label={`Rank ${row.rank}: ${row.player}, ${category.metricLabel} ${row.value}, win rate ${row.winRate}, ${row.sessions} sessions, ${trendLabel}`}
                  className="block focus:outline-none focus-visible:bg-white/5"
                >
                  {/* Mobile (<md): single-row card with avatar, name, value
                      stacked next to rank — readable on 360px screens. */}
                  <div className="md:hidden flex items-center gap-3 px-4 py-3 min-h-[64px] hover:bg-white/5 transition-colors group">
                    <div className="flex flex-col items-center justify-center w-10 shrink-0">
                      <span className="text-lg font-black text-white/50 leading-none">
                        #{row.rank}
                      </span>
                      <span aria-label={trendLabel} title={trendLabel} className="mt-1">
                        {row.trendDirection === "up" && (
                          <ArrowUpRight size={14} className="text-[#39FF14]" aria-hidden="true" />
                        )}
                        {row.trendDirection === "down" && (
                          <ArrowDownRight size={14} className="text-red-400" aria-hidden="true" />
                        )}
                        {row.trendDirection === "flat" && (
                          <Minus size={14} className="text-white/20" aria-hidden="true" />
                        )}
                      </span>
                    </div>
                    <PlayerAvatar
                      name={row.player}
                      avatarUrl={avatarMap[row.player]}
                      size={44}
                      className="rounded-full border border-white/10 group-hover:border-[#39FF14]/50 transition-colors shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-base group-hover:text-[#39FF14] transition-colors truncate">
                        {row.player}
                      </p>
                      <p className="text-xs text-white/40 mt-0.5 tabular-nums">
                        {row.winRate} win · {row.sessions} sess
                      </p>
                    </div>
                    <span
                      className={`font-black text-lg tabular-nums shrink-0 ${
                        valueIsNegative ? "text-red-400" : "text-[#39FF14]"
                      }`}
                    >
                      {valueIsNegative ? row.value : `+${row.value.replace(/^\+?/, "")}`}
                    </span>
                  </div>

                  {/* Tablet+ (md+): full table grid. */}
                  <div className="hidden md:grid grid-cols-12 gap-3 px-4 py-3 items-center hover:bg-white/5 transition-colors group min-h-[56px]">
                    <div className="col-span-2 text-center flex items-center justify-center gap-2">
                      <span className="text-xl font-black text-white/40">#{row.rank}</span>
                      <span aria-label={trendLabel} title={trendLabel}>
                        {row.trendDirection === "up" && (
                          <ArrowUpRight size={14} className="text-[#39FF14]" aria-hidden="true" />
                        )}
                        {row.trendDirection === "down" && (
                          <ArrowDownRight size={14} className="text-red-400" aria-hidden="true" />
                        )}
                        {row.trendDirection === "flat" && (
                          <Minus size={14} className="text-white/20" aria-hidden="true" />
                        )}
                      </span>
                    </div>
                    <div className="col-span-4 flex items-center gap-3 min-w-0">
                      <PlayerAvatar
                        name={row.player}
                        avatarUrl={avatarMap[row.player]}
                        size={48}
                        className="rounded-full border border-white/10 group-hover:border-[#39FF14]/50 transition-colors"
                      />
                      <span className="font-bold text-base group-hover:text-[#39FF14] transition-colors truncate">
                        {row.player}
                      </span>
                    </div>
                    <div className="col-span-2 text-right">
                      <span
                        className={`font-black text-lg tabular-nums ${
                          valueIsNegative ? "text-red-400" : "text-[#39FF14]"
                        }`}
                      >
                        {row.value}
                      </span>
                    </div>
                    <div className="col-span-2 text-center font-semibold text-base text-white/70 tabular-nums">
                      {row.winRate}
                    </div>
                    <div className="col-span-2 text-center font-semibold text-base text-white/70 tabular-nums">
                      {row.sessions}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </main>
  );
}
