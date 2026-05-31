import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, GitMerge } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isAdminDb } from "@/lib/auth";
import { fetchAliasRecords } from "@/lib/aliases-db";
import { fetchEffectiveGames } from "@/lib/game-store";
import AliasForm from "@/components/AliasForm";
import AliasRow from "@/components/AliasRow";

export const dynamic = "force-dynamic";

export default async function AdminMergePage() {
  const sb = await createSupabaseServerClient();
  const { data: { user } } = await sb.auth.getUser();
  const userIsAdmin = await isAdminDb(sb, user?.email);
  if (!userIsAdmin) redirect("/");

  const [aliases, games] = await Promise.all([
    fetchAliasRecords(sb),
    fetchEffectiveGames(sb),
  ]);

  // Detect candidate variants in the existing data — case-different
  // versions of the same lowercase name are common enough that surfacing
  // them as one-click suggestions saves typing.
  const namesByLower = new Map<string, Set<string>>();
  for (const g of games) {
    for (const p of g.players) {
      const lower = p.name.toLowerCase();
      if (!namesByLower.has(lower)) namesByLower.set(lower, new Set());
      namesByLower.get(lower)!.add(p.name);
    }
  }
  const variantSuggestions = [...namesByLower.entries()]
    .filter(([, set]) => set.size > 1)
    .map(([lower, set]) => ({ lower, variants: [...set] }));

  // Also surface registered users so the form can suggest canonical names.
  const { data: usersData } = await sb
    .from("users")
    .select("player_name")
    .order("player_name");
  const canonicalSuggestions = Array.from(
    new Set((usersData ?? []).map((u: { player_name: string }) => u.player_name)),
  );

  return (
    <main className="flex-1 md:min-h-0 md:overflow-auto bg-[radial-gradient(circle_at_top,_rgba(57,255,20,0.05)_0%,_rgba(14,17,23,1)_60%)] text-[#FAFAFA] px-4 md:px-6 xl:px-12 py-5">
      <div className="max-w-4xl mx-auto">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-base text-white/50 hover:text-[#39FF14] font-semibold transition-colors mb-6"
        >
          <ChevronLeft size={18} />
          <span>Back to Dashboard</span>
        </Link>

        <div className="flex items-center gap-3 mb-8">
          <div className="p-2.5 bg-purple-400/10 rounded-xl border border-purple-400/30">
            <GitMerge className="text-purple-400" size={22} />
          </div>
          <div>
            <h1 className="text-2xl md:text-4xl font-black tracking-tight uppercase leading-none">
              Player Merge
            </h1>
            <p className="text-white/50 text-base mt-2">
              Collapse duplicate names (case variants, typos) so they roll up into one roster entry.
            </p>
          </div>
        </div>

        {variantSuggestions.length > 0 && (
          <section className="bg-yellow-400/5 border border-yellow-400/30 rounded-2xl p-4 mb-4">
            <h2 className="text-xs font-black tracking-widest uppercase text-yellow-400 mb-2">
              Detected variants
            </h2>
            <p className="text-xs text-white/60 mb-3">
              These names show up with multiple capitalisations across the
              session log. Adding an alias for one of them collapses them all.
            </p>
            <ul className="flex flex-col gap-1.5">
              {variantSuggestions.map((s) => (
                <li
                  key={s.lower}
                  className="text-xs text-white/70 bg-black/30 rounded-md px-2 py-1.5 tabular-nums"
                >
                  <span className="font-mono text-yellow-400">{s.lower}</span>
                  {" → "}
                  {s.variants.join(", ")}
                </li>
              ))}
            </ul>
          </section>
        )}

        <AliasForm canonicalSuggestions={canonicalSuggestions} />

        <section className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl mt-4">
          <header className="px-4 py-3 border-b border-white/10">
            <h2 className="text-xs font-black tracking-widest uppercase text-white/70">
              Existing aliases ({aliases.length})
            </h2>
          </header>
          {aliases.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-white/30">
              No aliases yet. Add one above to merge duplicate names.
            </p>
          ) : (
            <ul className="divide-y divide-white/5">
              {aliases.map((a) => (
                <AliasRow key={a.aliasLower} alias={a} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
