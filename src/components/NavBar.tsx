"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import { Menu, X } from "lucide-react";
import { setSessionItem, useSessionItem } from "@/lib/use-hydration";

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/games", label: "Games" },
  { href: "/players", label: "Players" },
  { href: "/leaderboards", label: "Leaderboards" },
];

export default function NavBar() {
  const pathname = usePathname() || "/";

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const liveGameIdInUrl = (() => {
    const match = pathname.match(/^\/games\/([^/]+)$/);
    return match && match[1] !== "create" ? match[1] : null;
  })();

  // Persist the live game id whenever we land on a live game URL. Going
  // through `setSessionItem` notifies any same-tab `useSessionItem` subscribers
  // so the dashboard's "Resume Live Session" CTA appears immediately.
  useEffect(() => {
    if (liveGameIdInUrl) setSessionItem("liveGameId", liveGameIdInUrl);
  }, [liveGameIdInUrl]);

  const storedFromSession = useSessionItem("liveGameId");
  const storedGameId = liveGameIdInUrl ?? storedFromSession;

  const showLiveBadge = Boolean(storedGameId);

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(href + "/");
  };

  return (
    <motion.nav
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="sticky top-0 border-b border-white/10 bg-[#0E1117]/95 md:bg-white/5 backdrop-blur-xl px-4 md:px-6 xl:px-12 py-3 z-50 select-none shrink-0"
    >
      <div className="w-full flex items-center justify-between gap-4">
        <Link
          href="/"
          className="text-xl md:text-2xl font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-[#39FF14] to-cyan-400"
        >
          POKER TRACKER
        </Link>

        <div className="flex items-center gap-3 md:gap-6">
          {showLiveBadge && storedGameId && (
            <Link
              href={`/games/${storedGameId}`}
              className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-red-500/10 border border-red-500/30 hover:bg-red-500/20 hover:border-red-500/50 transition-colors"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
              </span>
              <span className="text-xs font-black text-red-400 tracking-widest uppercase">
                Live
              </span>
            </Link>
          )}

          <div className="hidden md:flex gap-6 text-base font-semibold text-white/70">
            {links.map((l) => {
              const active = isActive(l.href);
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  aria-current={active ? "page" : undefined}
                  className={`relative transition-colors py-1 ${
                    active
                      ? "text-[#39FF14] after:absolute after:left-0 after:right-0 after:-bottom-0.5 after:h-[2px] after:bg-[#39FF14] after:rounded-full"
                      : "hover:text-[#39FF14]"
                  }`}
                >
                  {l.label}
                </Link>
              );
            })}
          </div>

          <button
            className="md:hidden text-white/70 hover:text-[#39FF14] transition-colors inline-flex items-center justify-center w-11 h-11 -mr-2"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-nav"
          >
            {mobileMenuOpen ? <X size={26} /> : <Menu size={26} />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            id="mobile-nav"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden overflow-hidden flex flex-col gap-1 mt-3"
          >
            <div className="pt-3 pb-1 border-t border-white/10 flex flex-col gap-1">
              {links.map((l) => {
                const active = isActive(l.href);
                return (
                  <Link
                    key={l.href}
                    href={l.href}
                    onClick={() => setMobileMenuOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={`min-h-11 flex items-center text-base font-bold tracking-widest uppercase rounded-md px-2 -mx-2 transition-colors ${
                      active
                        ? "text-[#39FF14] bg-[#39FF14]/5"
                        : "text-white/70 hover:text-white hover:bg-white/5"
                    }`}
                  >
                    {l.label}
                  </Link>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.nav>
  );
}
