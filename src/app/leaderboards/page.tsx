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

      {/* Category Switcher */}
      <div className="flex flex-wrap gap-1.5 mb-4 shrink-0">
        {leaderboardCategoryOrder.map((slug) => {
          const c = leaderboardCategories[slug];
          const active = slug === category.slug;
          return (
            <Link
              key={slug}
              href={`/leaderboards?category=${slug}`}
              className={`text-xs font-bold tracking-widest uppercase px-2.5 py-1.5 rounded-md border transition-colors ${
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

      {/* Top 3 Podium — fixed shrink. Extra top padding so the absolute crown
          icon on the #1 card never overlaps the category switcher above. */}
      {podium.length > 0 && (
        <div className="grid grid-cols-3 gap-2 md:gap-4 mb-4 mt-6 md:mt-8 items-end shrink-0">
          {podium.map((row) => {
            const realRank = row.rank;
            // When we have a full podium, reorder visually so #1 sits in the middle.
            // Keyboard tab order follows natural rank order via DOM, CSS `order` only shuffles paint.
            const visualOrder =
              podium.length >= 3
                ? realRank === 1
                  ? 2
                  : realRank === 2
                    ? 1
                    : 3
                : realRank;
            const heightClass =
              realRank === 1
                ? "h-[210px] sm:h-[240px] md:h-[270px]"
                : realRank === 2
                  ? "h-[190px] sm:h-[215px] md:h-[240px]"
                  : "h-[170px] sm:h-[190px] md:h-[215px]";
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
                style={{ order: visualOrder }}
                className="group"
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
                      size={realRank === 1 ? 72 : 60}
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
                      size={realRank === 1 ? 100 : 84}
                      className={`hidden sm:block rounded-full border-[3px] shadow-lg ${borderColor} ${
                        realRank === 1
                          ? "shadow-yellow-400/30"
                          : realRank === 2
                            ? "shadow-gray-300/20"
                            : "shadow-orange-400/20"
                      }`}
                    />
                    <p className="font-black text-white text-xs sm:text-sm text-center max-w-full truncate leading-tight px-1">
                      {row.player}
                    </p>
                    <div className="flex items-center justify-around w-full gap-2 mt-auto">
                      <div className="flex flex-col items-center min-w-0">
                        <span className={`text-base sm:text-xl font-black leading-none ${rankColor}`}>#{realRank}</span>
                        <span className="text-[9px] sm:text-[10px] text-white/40 font-bold uppercase tracking-widest mt-0.5">{row.sessions} sess</span>
                      </div>
                      <div className="flex flex-col items-center min-w-0">
                        <span className="text-sm sm:text-base font-bold text-cyan-400 leading-none">{row.winRate}</span>
                        <span className="text-[9px] sm:text-[10px] text-white/40 font-bold uppercase tracking-widest mt-0.5">win</span>
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
          <div className="grid grid-cols-12 gap-3 px-4 py-2.5 border-b border-white/10 bg-black/20 text-xs font-bold text-white/40 uppercase tracking-widest shrink-0">
            <div className="col-span-2 text-center">Rank</div>
            <div className="col-span-5 md:col-span-4">Player</div>
            <div className="col-span-5 md:col-span-2 text-right">{category.metricLabel}</div>
            <div className="hidden md:block col-span-2 text-center">Win Rate</div>
            <div className="hidden md:block col-span-2 text-center">Sessions</div>
          </div>

          <div className="md:flex-1 md:min-h-0 md:overflow-auto divide-y divide-white/5">
            {rest.map((row) => (
              <Link
                key={row.rank}
                href={`/profile/${encodeURIComponent(row.player.toLowerCase().replace(/ /g, "-"))}`}
              >
                <div className="grid grid-cols-12 gap-3 px-4 py-3 items-center hover:bg-white/5 transition-colors cursor-pointer group">
                  <div className="col-span-2 text-center flex items-center justify-center gap-1.5 md:gap-2">
                    <span className="text-lg md:text-xl font-black text-white/40">
                      #{row.rank}
                    </span>
                    {row.trendDirection === "up" && <ArrowUpRight size={14} className="text-[#39FF14]" />}
                    {row.trendDirection === "down" && <ArrowDownRight size={14} className="text-red-400" />}
                    {row.trendDirection === "flat" && <Minus size={14} className="text-white/20" />}
                  </div>
                  <div className="col-span-5 md:col-span-4 flex items-center gap-3">
                    <PlayerAvatar
                      name={row.player}
                      avatarUrl={avatarMap[row.player]}
                      size={48}
                      className="rounded-full border border-white/10 group-hover:border-[#39FF14]/50 transition-colors"
                    />
                    <span className="font-bold text-base group-hover:text-[#39FF14] transition-colors">
                      {row.player}
                    </span>
                  </div>
                  <div className="col-span-5 md:col-span-2 text-right">
                    <span
                      className={`font-black text-base md:text-lg ${
                        row.value.startsWith("-") ? "text-red-400" : "text-[#39FF14]"
                      }`}
                    >
                      {row.value}
                    </span>
                  </div>
                  <div className="hidden md:block col-span-2 text-center font-semibold text-base text-white/70">
                    {row.winRate}
                  </div>
                  <div className="hidden md:block col-span-2 text-center font-semibold text-base text-white/70">
                    {row.sessions}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
