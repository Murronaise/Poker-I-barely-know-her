import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, Undo2, Calendar, AlertTriangle } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isAdminDb } from "@/lib/auth";
import { fetchDeletedGameRecords } from "@/lib/soft-delete-db";
import { fetchSavedGames } from "@/lib/games-db";
import { historicalGames } from "@/lib/historical-games";
import RestoreButton from "@/components/RestoreButton";

export const dynamic = "force-dynamic";

export default async function AdminRestorePage() {
  const sb = await createSupabaseServerClient();
  const { data: { user } } = await sb.auth.getUser();
  const userIsAdmin = await isAdminDb(sb, user?.email);
  if (!userIsAdmin) redirect("/");

  const [records, savedGames] = await Promise.all([
    fetchDeletedGameRecords(sb),
    fetchSavedGames(sb),
  ]);
  
  // Resolve actor names for the "deleted by" column.
  const actorIds = Array.from(
    new Set(records.map((r) => r.deletedBy).filter((id): id is string => Boolean(id))),
  );
  const actorNames = new Map<string, string>();
  if (actorIds.length > 0) {
    const { data: users } = await sb
      .from("users")
      .select("user_id, player_name")
      .in("user_id", actorIds);
    (users ?? []).forEach((u: { user_id: string; player_name: string }) => {
      actorNames.set(u.user_id, u.player_name);
    });
  }

  const allGames = [...savedGames, ...historicalGames];

  // For each record, look up the underlying game metadata so the row has
  // a readable label rather than just a hash.
  const decorated = records.map((r) => {
    const game = allGames.find((g) => g.id === r.gameId);
    return { ...r, game };
  });

  return (
    <main className="flex-1 md:min-h-0 md:overflow-auto bg-[radial-gradient(circle_at_top,_rgba(57,255,20,0.05)_0%,_rgba(14,17,23,1)_60%)] text-[#FAFAFA] px-4 md:px-6 xl:px-12 py-5">
      <div className="max-w-4xl mx-auto">
        <Link
          href="/games"
          className="inline-flex items-center gap-2 text-base text-white/50 hover:text-[#39FF14] font-semibold transition-colors mb-6"
        >
          <ChevronLeft size={18} />
          <span>Back to Games</span>
        </Link>

        <div className="flex items-center gap-3 mb-8">
          <div className="p-2.5 bg-cyan-400/10 rounded-xl border border-cyan-400/30">
            <Undo2 className="text-cyan-400" size={22} />
          </div>
          <div>
            <h1 className="text-2xl md:text-4xl font-black tracking-tight uppercase leading-none">
              Restore Games
            </h1>
            <p className="text-white/50 text-base mt-2">
              Games soft-deleted across all devices. Restoring puts them back on the games index.
            </p>
          </div>
        </div>

        {decorated.length === 0 ? (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-8 text-center">
            <p className="text-sm font-bold tracking-widest uppercase text-white/40">
              Nothing in the bin
            </p>
            <p className="text-xs text-white/30 mt-2">
              Deleted games show up here so you can put them back.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {decorated.map((r) => {
              const actor = r.deletedBy ? actorNames.get(r.deletedBy) : null;
              return (
                <div
                  key={r.gameId}
                  className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Calendar size={14} className="text-white/40 shrink-0" />
                      <p className="text-base font-bold text-white truncate">
                        {r.game ? r.game.date : <span className="text-yellow-400">Unknown game · {r.gameId}</span>}
                      </p>
                      {!r.game && (
                        <span title="Game not found in current historical-games.ts" className="shrink-0 inline-flex">
                          <AlertTriangle size={12} className="text-yellow-400" />
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-white/40 tabular-nums">
                      {r.game ? `${r.game.location} · ${r.game.duration} · £${r.game.totalPot.toLocaleString()}` : "—"}
                    </p>
                    <p className="text-[10px] text-white/30 mt-1 tracking-widest uppercase">
                      Deleted {new Date(r.deletedAt).toLocaleString()}
                      {actor ? ` · by ${actor}` : ""}
                      {r.reason ? ` · ${r.reason}` : ""}
                    </p>
                  </div>
                  <RestoreButton gameId={r.gameId} />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
