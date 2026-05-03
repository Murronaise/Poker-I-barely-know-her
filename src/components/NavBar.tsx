"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import { Menu, X } from "lucide-react";
import { useSessionItem } from "@/lib/use-hydration";

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

  // Persist the live game id whenever we land on a live game URL.
  useEffect(() => {
    if (liveGameIdInUrl) sessionStorage.setItem("liveGameId", liveGameIdInUrl);
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
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`transition-colors ${
                  isActive(l.href) ? "text-[#39FF14]" : "hover:text-[#39FF14]"
                }`}
              >
                {l.label}
              </Link>
            ))}
          </div>

          <button
            className="md:hidden text-white/70 hover:text-[#39FF14] transition-colors p-1"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle mobile menu"
          >
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden overflow-hidden flex flex-col gap-4 mt-3"
          >
            <div className="pt-4 pb-2 border-t border-white/10 flex flex-col gap-4">
              {links.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`text-base font-bold tracking-widest uppercase transition-colors ${
                    isActive(l.href) ? "text-[#39FF14]" : "text-white/70 hover:text-white"
                  }`}
                >
                  {l.label}
                </Link>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.nav>
  );
}
