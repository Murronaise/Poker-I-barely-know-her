"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useCallback } from "react";
import { Menu, X, LogOut, UserCircle, Shield, ChevronDown } from "lucide-react";
import { setLiveGameId, useLiveGameId } from "@/lib/live-game-store";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { onProfileUpdated } from "@/lib/profile-events";
import { isAdmin as isAdminEmail } from "@/lib/auth";
import { profileSlug } from "@/lib/registered-players";
import PlayerAvatar from "@/components/PlayerAvatar";

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/games", label: "Games" },
  { href: "/games/poll", label: "Polls" },
  { href: "/players", label: "Players" },
  { href: "/leaderboards", label: "Leaderboards" },
  { href: "/changelog", label: "Changelog" },
];

type CurrentUser = { id: string; email?: string };

export default function NavBar() {
  const pathname = usePathname() || "/";
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [playerName, setPlayerName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [iAmAdmin, setIAmAdmin] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [loading, setLoading] = useState(true);

  // Pull the player_name + admin status + avatar for the navbar chip. The
  // avatar comes from the public `players` table (separate from `users`)
  // because that's where the historical-game roster is stored.
  const refreshProfile = useCallback(
    async (email?: string | null) => {
      if (!email) {
        setPlayerName("");
        setAvatarUrl(null);
        setIAmAdmin(false);
        return;
      }
      const { data } = await supabase
        .from("users")
        .select("player_name, is_admin")
        .eq("email", email)
        .maybeSingle();
      const name = data?.player_name ?? "";
      setPlayerName(name);
      setIAmAdmin(data?.is_admin === true || isAdminEmail(email));

      if (name) {
        const { data: playerRow } = await supabase
          .from("players")
          .select("avatar_url")
          .ilike("name", name)
          .maybeSingle();
        setAvatarUrl(playerRow?.avatar_url ?? null);
      } else {
        setAvatarUrl(null);
      }
    },
    [supabase],
  );

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      try {
        const { data } = await supabase.auth.getUser();
        if (cancelled) return;
        setUser(data.user ? { id: data.user.id, email: data.user.email } : null);
        await refreshProfile(data.user?.email);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    init();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      const next = session?.user
        ? { id: session.user.id, email: session.user.email }
        : null;
      setUser(next);
      refreshProfile(next?.email);
    });

    const offProfile = onProfileUpdated(() => {
      supabase.auth.getUser().then(({ data }) => refreshProfile(data.user?.email));
    });

    return () => {
      cancelled = true;
      authListener?.subscription.unsubscribe();
      offProfile();
    };
  }, [supabase, refreshProfile]);

  // Close user menu when clicking outside
  useEffect(() => {
    if (!showUserMenu) return;
    const close = () => setShowUserMenu(false);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [showUserMenu]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setPlayerName("");
    setAvatarUrl(null);
    router.push("/");
    router.refresh();
  };

  const liveGameIdInUrl = (() => {
    const match = pathname.match(/^\/games\/([^/]+)$/);
    if (!match) return null;
    // /games/[id] is the live-game route, but other reserved single-segment
    // children share the prefix and would otherwise get stored as a fake live
    // game id (which then made the dashboard show "Join Live Game" linking to
    // /games/poll when the user only opened a poll, not a game).
    const RESERVED = new Set(["create", "poll", "history"]);
    return RESERVED.has(match[1]) ? null : match[1];
  })();

  // Persist the live game id whenever we land on a live game URL so the
  // dashboard's "Resume Live Session" CTA appears immediately. The helper
  // also stamps today's date so a stale id from a previous day is ignored.
  useEffect(() => {
    if (liveGameIdInUrl) setLiveGameId(liveGameIdInUrl);
  }, [liveGameIdInUrl]);

  const storedFromSession = useLiveGameId();
  const storedGameId = liveGameIdInUrl ?? storedFromSession;
  const showLiveBadge = Boolean(storedGameId);

  // A link is active if it's the longest prefix-match for the current
  // pathname — without this, "/games" would also light up when on
  // "/games/poll" (both prefix-match), so users would see two tabs active.
  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    if (pathname !== href && !pathname.startsWith(href + "/")) return false;
    return !links.some(
      (l) => l.href !== href && l.href.startsWith(href + "/") && (pathname === l.href || pathname.startsWith(l.href + "/")),
    );
  };

  const displayName = playerName || user?.email?.split("@")[0] || "Account";

  return (
    <motion.nav
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="sticky top-0 border-b border-white/10 bg-[#0E1117]/95 md:bg-[#0E1117]/70 backdrop-blur-xl px-4 md:px-6 xl:px-12 z-50 select-none shrink-0"
    >
      {/* Subtle gradient line at the very top — gives the bar a luxe feel */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#39FF14]/40 to-transparent opacity-60" aria-hidden="true" />

      <div className="w-full flex items-center justify-between gap-4 py-3">
        {/* ---- Brand ---- */}
        <Link href="/" className="group flex items-center gap-2.5 md:gap-3 shrink-0" aria-label="Poker Tracker — home">
          <PokerChip />
          <motion.span
            className="text-xl md:text-2xl font-black tracking-widest text-transparent bg-clip-text bg-[length:200%_100%]"
            style={{
              backgroundImage:
                "linear-gradient(110deg, #39FF14 0%, #00e5ff 25%, #39FF14 50%, #00e5ff 75%, #39FF14 100%)",
              filter: "drop-shadow(0 0 12px rgba(57,255,20,0.25))",
            }}
            animate={{ backgroundPosition: ["0% 50%", "200% 50%"] }}
            transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
          >
            POKER&nbsp;TRACKER
          </motion.span>
        </Link>

        {/* ---- Centre: nav links (desktop) ---- */}
        <div className="hidden md:flex flex-1 items-center justify-center gap-1">
          {links.map((l) => {
            const active = isActive(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={`relative px-3 py-1.5 rounded-md text-sm font-bold tracking-wide transition-colors ${
                  active
                    ? "text-[#39FF14] bg-[#39FF14]/5"
                    : "text-white/60 hover:text-white hover:bg-white/5"
                }`}
              >
                {l.label}
                {active && (
                  <motion.span
                    layoutId="navActiveDot"
                    className="absolute left-1/2 -bottom-0.5 -translate-x-1/2 w-1 h-1 rounded-full bg-[#39FF14] shadow-[0_0_6px_rgba(57,255,20,0.8)]"
                  />
                )}
              </Link>
            );
          })}
        </div>

        {/* ---- Right: status chips ---- */}
        <div className="flex items-center gap-2 shrink-0">
          {showLiveBadge && storedGameId && (
            <Link
              href={`/games/${storedGameId}`}
              className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30 hover:bg-red-500/20 hover:border-red-500/50 transition-colors"
              title="Resume the active live session"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
              </span>
              <span className="text-[10px] font-black text-red-400 tracking-widest uppercase">
                Live
              </span>
            </Link>
          )}

          {!loading && (
            <>
              {user ? (
                <div className="relative hidden md:block">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowUserMenu(!showUserMenu);
                    }}
                    aria-haspopup="menu"
                    aria-expanded={showUserMenu}
                    className={`flex items-center gap-2 pl-1 pr-2.5 py-1 rounded-full border transition-colors group ${
                      showUserMenu
                        ? "bg-[#39FF14]/15 border-[#39FF14]/50"
                        : "bg-white/5 border-white/10 hover:bg-[#39FF14]/10 hover:border-[#39FF14]/40"
                    }`}
                  >
                    <PlayerAvatar
                      name={displayName}
                      avatarUrl={avatarUrl}
                      size={28}
                      className="rounded-full border border-white/20 shrink-0"
                    />
                    <span className={`text-xs font-black tracking-widest uppercase max-w-[120px] truncate transition-colors ${
                      showUserMenu ? "text-[#39FF14]" : "text-white/80 group-hover:text-[#39FF14]"
                    }`}>
                      {displayName}
                    </span>
                    {iAmAdmin && (
                      <Shield
                        size={12}
                        className={`shrink-0 transition-colors ${showUserMenu ? "text-[#39FF14]" : "text-cyan-400/80"}`}
                        aria-label="Admin"
                      />
                    )}
                    <ChevronDown
                      size={12}
                      aria-hidden="true"
                      className={`text-white/40 transition-transform ${showUserMenu ? "rotate-180 text-[#39FF14]" : ""}`}
                    />
                  </button>

                  <AnimatePresence>
                    {showUserMenu && (
                      <motion.div
                        initial={{ opacity: 0, y: -6, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -6, scale: 0.96 }}
                        transition={{ duration: 0.15 }}
                        className="absolute right-0 mt-2 w-56 bg-[#0E1117] border border-white/15 rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.6)] z-40 overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="px-4 py-3 bg-white/[0.03] border-b border-white/10 flex items-center gap-3">
                          <PlayerAvatar
                            name={displayName}
                            avatarUrl={avatarUrl}
                            size={36}
                            className="rounded-full border border-white/20 shrink-0"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-black text-white truncate">{displayName}</p>
                            <p className="text-xs text-white/40 truncate">{user.email}</p>
                          </div>
                        </div>
                        <Link
                          href={playerName ? `/profile/${profileSlug(playerName)}` : "/account"}
                          className="flex items-center gap-2 px-4 py-3 text-sm font-semibold text-white/80 hover:text-white hover:bg-white/5 transition-colors"
                          onClick={() => setShowUserMenu(false)}
                        >
                          <UserCircle size={14} />
                          Profile
                        </Link>
                        <div className="border-t border-white/10" />
                        <button
                          onClick={() => {
                            setShowUserMenu(false);
                            handleLogout();
                          }}
                          className="w-full flex items-center gap-2 px-4 py-3 text-sm font-semibold text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors text-left"
                        >
                          <LogOut size={14} />
                          Logout
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ) : (
                <Link
                  href="/login"
                  className="hidden md:inline-flex items-center px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs font-black text-white/70 hover:text-[#39FF14] hover:border-[#39FF14]/40 hover:bg-[#39FF14]/5 uppercase tracking-widest transition-colors"
                >
                  Login
                </Link>
              )}
            </>
          )}

          {/* Mobile hamburger */}
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
            className="md:hidden overflow-hidden flex flex-col gap-1 pb-3"
          >
            <div className="pt-3 border-t border-white/10 flex flex-col gap-1">
              {!loading && user && (
                <div className="flex items-center justify-between gap-2 px-2 -mx-2 py-2 mb-1 rounded-lg bg-white/5 border border-white/10">
                  <Link
                    href={playerName ? `/profile/${profileSlug(playerName)}` : "/account"}
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex-1 flex items-center gap-3 min-h-11"
                  >
                    <PlayerAvatar
                      name={displayName}
                      avatarUrl={avatarUrl}
                      size={36}
                      className="rounded-full border border-white/20 shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-black text-white truncate">{displayName}</span>
                        {iAmAdmin && <Shield size={12} className="text-cyan-400/80 shrink-0" />}
                      </div>
                      <span className="text-[10px] text-white/40 uppercase tracking-widest font-bold">Account</span>
                    </div>
                  </Link>
                  <button
                    onClick={() => {
                      setMobileMenuOpen(false);
                      handleLogout();
                    }}
                    className="inline-flex items-center justify-center w-11 h-11 rounded-md text-red-400 hover:bg-red-500/10 transition-colors shrink-0"
                    aria-label="Logout"
                  >
                    <LogOut size={18} />
                  </button>
                </div>
              )}
              {!loading && !user && (
                <Link
                  href="/login"
                  onClick={() => setMobileMenuOpen(false)}
                  className="min-h-11 flex items-center text-base font-bold tracking-widest uppercase rounded-md px-2 -mx-2 mb-1 text-[#39FF14] bg-[#39FF14]/5 border border-[#39FF14]/20"
                >
                  Login / Sign up
                </Link>
              )}

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

/**
 * Inline SVG poker chip used as the brand mark. Animates: spins one full
 * turn on hover and "breathes" a soft glow continuously so it feels alive
 * without being distracting.
 */
function PokerChip() {
  return (
    <motion.div
      whileHover={{ rotate: 360 }}
      transition={{ duration: 0.7, ease: "easeInOut" }}
      className="relative w-8 h-8 md:w-9 md:h-9 shrink-0"
      aria-hidden="true"
    >
      {/* Soft glow halo behind the chip — subtle pulse so it draws the eye */}
      <motion.span
        className="absolute inset-0 rounded-full bg-[#39FF14]/40 blur-md"
        animate={{ opacity: [0.35, 0.7, 0.35] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      />
      <svg viewBox="0 0 40 40" className="relative w-full h-full">
        <defs>
          <linearGradient id="chipRim" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#39FF14" />
            <stop offset="100%" stopColor="#00e5ff" />
          </linearGradient>
          <linearGradient id="chipFace" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1a1f29" />
            <stop offset="100%" stopColor="#0E1117" />
          </linearGradient>
        </defs>
        {/* Outer rim */}
        <circle cx="20" cy="20" r="18" fill="url(#chipFace)" stroke="url(#chipRim)" strokeWidth="2" />
        {/* Edge dashes — what makes a poker chip a poker chip */}
        {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
          <rect
            key={deg}
            x="19"
            y="2"
            width="2"
            height="4.5"
            rx="0.5"
            fill="#39FF14"
            transform={`rotate(${deg} 20 20)`}
          />
        ))}
        {/* Inner ring */}
        <circle cx="20" cy="20" r="11" fill="none" stroke="url(#chipRim)" strokeWidth="1" opacity="0.55" />
        {/* Spade pip in the centre */}
        <path
          d="M20 12 C 16 16, 14 18, 14 21 C 14 23, 16 24, 18 23 C 17.5 25, 17 26, 16 27 H 24 C 23 26, 22.5 25, 22 23 C 24 24, 26 23, 26 21 C 26 18, 24 16, 20 12 Z"
          fill="#39FF14"
        />
      </svg>
    </motion.div>
  );
}
