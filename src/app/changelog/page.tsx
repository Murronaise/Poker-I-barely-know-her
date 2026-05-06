"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { ChevronLeft, Zap, Bug, Lightbulb, AlertTriangle, History, Lock, Eye, EyeOff } from "lucide-react";
import CollapsibleSection from "@/components/CollapsibleSection";
import {
  changelog,
  groupItemsByType,
  groupItemsByCategory,
  summariseCounts,
  typeLabel,
  TYPE_ORDER,
  filterChangelogForViewer,
  type ChangelogItemType,
  type ChangelogItem,
} from "@/lib/changelog";
import { motion } from "framer-motion";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isAdmin } from "@/lib/auth";

const typeConfig: Record<
  ChangelogItemType,
  { icon: typeof Zap; color: string; bg: string; border: string }
> = {
  feature:     { icon: Zap,             color: "text-[#39FF14]",   bg: "bg-[#39FF14]/10",  border: "border-[#39FF14]/20" },
  improvement: { icon: Lightbulb,       color: "text-cyan-400",    bg: "bg-cyan-400/10",   border: "border-cyan-400/20" },
  fix:         { icon: Bug,             color: "text-yellow-400",  bg: "bg-yellow-400/10", border: "border-yellow-400/20" },
  breaking:    { icon: AlertTriangle,   color: "text-red-400",     bg: "bg-red-400/10",    border: "border-red-400/20" },
};

export default function ChangelogPage() {
  const supabase = createSupabaseBrowserClient();
  const [iAmAdmin, setIAmAdmin] = useState(false);
  const [authResolved, setAuthResolved] = useState(false);
  // Admins can flip this off to preview the page exactly as a player sees it.
  const [previewAsPlayer, setPreviewAsPlayer] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const resolve = async () => {
      const { data } = await supabase.auth.getUser();
      const email = data.user?.email;
      if (!email) {
        if (!cancelled) {
          setIAmAdmin(false);
          setAuthResolved(true);
        }
        return;
      }
      // Fast path — hard-coded admin email.
      if (isAdmin(email)) {
        if (!cancelled) {
          setIAmAdmin(true);
          setAuthResolved(true);
        }
        return;
      }
      // Otherwise check the DB-side flag.
      const { data: profile } = await supabase
        .from("users")
        .select("is_admin")
        .eq("email", email)
        .maybeSingle();
      if (!cancelled) {
        setIAmAdmin(profile?.is_admin === true);
        setAuthResolved(true);
      }
    };
    resolve();
    return () => { cancelled = true; };
  }, [supabase]);

  // Effective admin view = real admin status AND not previewing as player.
  const showAdminItems = iAmAdmin && !previewAsPlayer;

  const visibleEntries = useMemo(
    () => filterChangelogForViewer(changelog, showAdminItems),
    [showAdminItems],
  );

  return (
    <main className="flex-1 md:min-h-0 md:overflow-auto bg-[radial-gradient(circle_at_top,_rgba(57,255,20,0.05)_0%,_rgba(14,17,23,1)_60%)] text-[#FAFAFA] px-4 md:px-6 xl:px-12 py-5">
      <div className="max-w-3xl mx-auto">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-base text-white/50 hover:text-[#39FF14] font-semibold transition-colors mb-6"
        >
          <ChevronLeft size={18} />
          <span>Back to Dashboard</span>
        </Link>

        {/* Title */}
        <div className="flex items-center gap-3 mb-8">
          <div className="p-2.5 bg-[#39FF14]/10 rounded-xl border border-[#39FF14]/20">
            <History className="text-[#39FF14]" size={22} />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl md:text-4xl font-black tracking-tight uppercase leading-none">
              Changelog
            </h1>
            <p className="text-white/50 text-base mt-2">Version history and release notes</p>
          </div>
          {authResolved && iAmAdmin && (
            <button
              onClick={() => setPreviewAsPlayer((v) => !v)}
              className={`inline-flex items-center gap-1.5 text-[10px] font-black tracking-widest uppercase rounded px-2 py-1 border transition-colors shrink-0 ${
                showAdminItems
                  ? "text-cyan-400 bg-cyan-400/10 border-cyan-400/30 hover:bg-cyan-400/20"
                  : "text-yellow-400 bg-yellow-400/10 border-yellow-400/30 hover:bg-yellow-400/20"
              }`}
              title={showAdminItems ? "Click to preview as a player" : "Click to switch back to admin view"}
            >
              {showAdminItems ? <Lock size={10} /> : <Eye size={10} />}
              <span className="hidden sm:inline">
                {showAdminItems ? "Admin View" : "Player Preview"}
              </span>
              <span className="sm:hidden">
                {showAdminItems ? "Admin" : "Preview"}
              </span>
            </button>
          )}
        </div>

        {/* Player-preview banner — visible only to admins who toggled it on,
            so it's always obvious you're seeing the filtered view. */}
        {iAmAdmin && previewAsPlayer && (
          <div className="bg-yellow-400/10 border border-yellow-400/30 rounded-2xl p-4 mb-4 flex items-center gap-3">
            <EyeOff size={16} className="text-yellow-400 shrink-0" />
            <p className="text-sm text-yellow-400/90 font-semibold flex-1 min-w-0">
              Previewing as a player — admin-only items are hidden.
            </p>
            <button
              onClick={() => setPreviewAsPlayer(false)}
              className="text-xs font-black tracking-widest uppercase text-yellow-400 hover:text-yellow-300 transition-colors shrink-0"
            >
              Exit
            </button>
          </div>
        )}

        {/* Entries */}
        <div className="flex flex-col gap-4">
          {visibleEntries.map((entry, idx) => {
            const isLatest = idx === 0;
            const categoryGroups = groupItemsByCategory(entry.items);
            const hasCategories = categoryGroups.some((g) => g.name !== null);

            return (
              <CollapsibleSection
                key={entry.version}
                title={`v${entry.version}`}
                defaultOpen={false}
                icon={
                  isLatest ? (
                    <span className="text-[10px] font-black tracking-widest uppercase text-[#39FF14] bg-[#39FF14]/10 border border-[#39FF14]/30 rounded px-1.5 py-0.5">
                      Latest
                    </span>
                  ) : null
                }
                rightSlot={
                  <div className="hidden sm:flex flex-col items-end gap-0.5 text-right">
                    <span className="text-xs font-mono text-white/40 uppercase tracking-widest">
                      {entry.date}
                    </span>
                    <span className="text-[10px] text-white/30 tracking-widest uppercase">
                      {summariseCounts(entry.items)}
                    </span>
                  </div>
                }
              >
                {/* Summary tagline */}
                {entry.summary && (
                  <p className="text-sm text-white/60 italic mb-4 -mt-1">
                    {entry.summary}
                  </p>
                )}

                {/* Mobile-only date strip */}
                <div className="sm:hidden flex items-center justify-between text-[10px] tracking-widest uppercase text-white/30 mb-3 pb-3 border-b border-white/5">
                  <span className="font-mono">{entry.date}</span>
                  <span>{summariseCounts(entry.items)}</span>
                </div>

                {/* Items grouped by category, then by type within each */}
                <div className="space-y-6">
                  {categoryGroups.map((group) => (
                    <CategorySection
                      key={group.name ?? "_uncategorised"}
                      name={group.name}
                      items={group.items}
                      showCategoryHeader={hasCategories && group.name !== null}
                      showAdminBadge={showAdminItems}
                    />
                  ))}
                </div>
              </CollapsibleSection>
            );
          })}
        </div>

        {/* Footer */}
        <div className="mt-12 pt-8 border-t border-white/5">
          <p className="text-sm text-white/40 text-center">
            Built with precision for your poker sessions. Updates released regularly.
          </p>
        </div>
      </div>
    </main>
  );
}

function CategorySection({
  name, items, showCategoryHeader, showAdminBadge,
}: {
  name: string | null;
  items: ChangelogItem[];
  showCategoryHeader: boolean;
  showAdminBadge: boolean;
}) {
  const grouped = groupItemsByType(items);

  return (
    <section>
      {showCategoryHeader && name && (
        <h3 className="text-sm md:text-base font-black tracking-tight uppercase text-white mb-3 pb-2 border-b border-white/10">
          {name}
        </h3>
      )}

      <div className="space-y-4">
        {TYPE_ORDER.map((type) => {
          const typeItems = grouped[type];
          if (typeItems.length === 0) return null;
          const config = typeConfig[type];
          const Icon = config.icon;

          return (
            <div key={type}>
              <div className={`flex items-center gap-2 mb-2 ${config.color}`}>
                <Icon size={14} />
                <h4 className="text-[10px] font-black tracking-widest uppercase">
                  {typeLabel(type)} ({typeItems.length})
                </h4>
                <div className="flex-1 h-px bg-white/5" />
              </div>
              <ul className="space-y-2">
                {typeItems.map((item, itemIdx) => (
                  <motion.li
                    key={itemIdx}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: itemIdx * 0.03 }}
                    className={`flex items-start gap-3 px-3 py-2 rounded-md ${config.bg} border ${config.border}`}
                  >
                    <span className={`mt-1.5 w-1 h-1 rounded-full ${config.color.replace("text-", "bg-")} shrink-0`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white/85 leading-relaxed">{item.text}</p>
                      {item.adminOnly && showAdminBadge && (
                        <span className="inline-flex items-center gap-1 mt-1.5 text-[10px] font-bold tracking-widest uppercase text-cyan-400/80">
                          <Lock size={9} />
                          Admin only — hidden from players
                        </span>
                      )}
                    </div>
                  </motion.li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
