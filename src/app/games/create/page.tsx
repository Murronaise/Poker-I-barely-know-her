"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ChevronLeft,
  Users,
  Timer,
  CircleDollarSign,
  Play,
  CheckCheck,
  X,
  Settings,
  MapPin,
  Coins,
} from "lucide-react";
import { motion } from "framer-motion";
import PlayerAvatar from "@/components/PlayerAvatar";
import { toast } from "sonner";
import { getVenue, setVenue, DEFAULT_VENUE, getBlindTemplates, saveBlindTemplate, deleteBlindTemplate, getStoredPlayers, type BlindTemplate } from "@/lib/local-store";
import { historicalGames } from "@/lib/historical-games";
import { supabase } from "@/lib/supabase";
import { loadRegisteredPlayers } from "@/lib/registered-players";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

// Seed roster + win-rate / last-session badges derived from real session
// history. Registered (Supabase users) and locally-added players get merged
// in on mount inside the component — they have no stats, so the badge
// renderer just skips them.
const { seedAvailablePlayers, playerStats } = (() => {
  const byName = new Map<string, { date: string; net: number; idx: number }[]>();
  // historicalGames is most-recent-first; preserve idx so we can find the
  // most recent session per player below.
  historicalGames.forEach((g, idx) => {
    g.players.forEach((p) => {
      const net = p.cashOut - p.buyIn - p.food;
      if (!byName.has(p.name)) byName.set(p.name, []);
      byName.get(p.name)!.push({ date: g.date, net, idx });
    });
  });

  const stats: Record<string, { winRate: number; lastResult: number | null }> = {};
  const names: string[] = [];
  byName.forEach((sessions, name) => {
    names.push(name);
    const wins = sessions.filter((s) => s.net >= 0).length;
    const winRate = Math.round((wins / sessions.length) * 100);
    // Most recent session is the smallest idx (since list is recent-first).
    const mostRecent = sessions.reduce((a, b) => (a.idx < b.idx ? a : b));
    stats[name] = { winRate, lastResult: Number(mostRecent.net.toFixed(2)) };
  });

  return { seedAvailablePlayers: names.sort(), playerStats: stats };
})();

const blindPresets = [
  { sb: 0.10, bb: 0.20, label: "£0.10 / £0.20" },
  { sb: 0.25, bb: 0.50, label: "£0.25 / £0.50" },
  { sb: 1, bb: 2, label: "£1 / £2" },
  { sb: 5, bb: 10, label: "£5 / £10" },
];

const timerPresets = [10, 15, 20, 30];
const buyInPresets = [0, 20, 50, 100];

export default function CreateGamePage() {
  const router = useRouter();
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  const [avatarMap, setAvatarMap] = useState<Record<string, string>>({});
  // Roster shown in the picker. Starts from session history (SSR-safe) and is
  // topped up on mount with any registered signups or locally-added players
  // so brand-new accounts are pickable for their first session.
  const [availablePlayers, setAvailablePlayers] = useState<string[]>(seedAvailablePlayers);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const sb = createSupabaseBrowserClient();
      const registered = await loadRegisteredPlayers(sb);
      if (cancelled) return;
      const seedLower = new Set(seedAvailablePlayers.map((n) => n.toLowerCase()));
      const merged = [...seedAvailablePlayers];
      const seenLower = new Set(seedLower);
      registered.forEach((displayName, lower) => {
        if (!seenLower.has(lower)) {
          merged.push(displayName);
          seenLower.add(lower);
        }
      });
      getStoredPlayers().forEach((p) => {
        const lower = p.name.toLowerCase();
        if (!seenLower.has(lower)) {
          merged.push(p.name);
          seenLower.add(lower);
        }
      });
      merged.sort((a, b) => a.localeCompare(b));
      setAvailablePlayers(merged);
    })();
    return () => { cancelled = true; };
  }, []);

  // Pull avatar URLs once on mount so the player picker shows real photos
  // instead of the initials fallback. Failures (missing env / offline) silently
  // leave the placeholder in place.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from("players")
          .select("name, avatar_url");
        if (cancelled || !data) return;
        const map: Record<string, string> = {};
        data.forEach((p: { name: string; avatar_url?: string | null }) => {
          if (p.avatar_url) map[p.name] = p.avatar_url;
        });
        setAvatarMap(map);
      } catch {
        // ignore — fallback avatars are fine
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  const [smallBlind, setSmallBlind] = useState<number>(0.10);
  const [bigBlind, setBigBlind] = useState<number>(0.20);
  const [blindTimer, setBlindTimer] = useState<number>(15);
  // Default buy-in applied to every selected player on game start. 0 means
  // "leave blank, players type their own buy-in on the spreadsheet."
  const [defaultBuyIn, setDefaultBuyIn] = useState<number>(0);
  // Venue defaults to whatever the user last saved (or "Toby's House" on first
  // run). Read lazily so SSR markup matches client.
  const [venue, setVenueState] = useState<string>(() =>
    typeof window === "undefined" ? DEFAULT_VENUE : getVenue(),
  );
  const [templates, setTemplates] = useState<BlindTemplate[]>([]);

  // Load blind templates on mount
  useEffect(() => {
    setTemplates(getBlindTemplates());
  }, []);

  const togglePlayer = (player: string) => {
    setSelectedPlayers((prev) =>
      prev.includes(player) ? prev.filter((p) => p !== player) : [...prev, player]
    );
  };

  const selectAll = () => setSelectedPlayers(availablePlayers);
  const clearAll = () => setSelectedPlayers([]);

  const applyBlindPreset = (sb: number, bb: number) => {
    setSmallBlind(sb);
    setBigBlind(bb);
  };

  const startGame = () => {
    if (selectedPlayers.length < 2) {
      toast.error("Pick at least 2 players to start a game.");
      return;
    }
    if (bigBlind <= smallBlind) {
      toast.error("Big blind must be greater than the small blind.");
      return;
    }

    // Persist the venue so it sticks across sessions — every future game
    // create form pre-fills with whatever the user last used.
    setVenue(venue);

    const gameId = Math.random().toString(36).substring(2, 9);
    const params = new URLSearchParams();
    selectedPlayers.forEach((p) => params.append("players", p));
    params.set("sb", smallBlind.toString());
    params.set("bb", bigBlind.toString());
    params.set("timer", blindTimer.toString());
    params.set("venue", venue.trim() || DEFAULT_VENUE);
    if (defaultBuyIn > 0) params.set("buyin", defaultBuyIn.toString());

    router.push(`/games/${gameId}?${params.toString()}`);
  };

  return (
    <motion.main
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="flex-1 flex flex-col md:min-h-0 md:overflow-y-auto bg-[radial-gradient(circle_at_top,_rgba(57,255,20,0.05)_0%,_rgba(14,17,23,1)_60%)] text-[#FAFAFA] px-4 md:px-6 xl:px-12 py-5"
    >
      <Link
        href="/games"
        className="inline-flex items-center gap-2 text-base text-white/50 hover:text-[#39FF14] font-semibold transition-colors mb-4 shrink-0"
      >
        <ChevronLeft size={18} />
        <span>Back to Games</span>
      </Link>

      <div className="flex items-center gap-3 mb-5 shrink-0">
        <div className="p-2.5 bg-[#39FF14]/10 rounded-xl border border-[#39FF14]/20 shrink-0">
          <Settings className="text-[#39FF14]" size={22} />
        </div>
        <div>
          <h1 className="text-2xl md:text-4xl font-black tracking-tight uppercase leading-none">
            Configure Game
          </h1>
          <p className="text-white/50 text-base mt-2">
            Pick the table, set the blinds and timer.
          </p>
        </div>
      </div>

      {/* Players selection — single horizontal strip; drag-/swipe-scroll if
          there are more cards than fit. Never grows vertically so the rest
          of the form stays on screen. */}
      <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl flex flex-col overflow-hidden mb-3 shrink-0">
        <div className="px-4 py-2.5 border-b border-white/10 flex items-center justify-between gap-3 flex-wrap shrink-0">
          <div className="flex items-center gap-3">
            <Users className="text-[#39FF14]" size={18} />
            <h2 className="text-base md:text-lg font-black tracking-widest uppercase">Select Players</h2>
            <span className="text-xs font-bold tracking-widest uppercase text-white/40 px-2 py-0.5 rounded-full bg-white/5 border border-white/10">
              {selectedPlayers.length} / {availablePlayers.length}
            </span>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={selectAll}
              className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest px-2.5 py-1 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-[#39FF14]/40 text-white/70 hover:text-[#39FF14] transition-colors"
            >
              <CheckCheck size={12} /> Select All
            </button>
            <button
              type="button"
              onClick={clearAll}
              className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest px-2.5 py-1 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-red-400/40 text-white/70 hover:text-red-400 transition-colors"
            >
              <X size={12} /> Clear
            </button>
          </div>
        </div>

        {/* Right-edge fade hints that the row scrolls when more players are
            hidden off-screen. Pointer-events-none so it doesn't intercept
            taps on the rightmost card. */}
        <div className="relative">
          <div className="overflow-x-auto overflow-y-hidden p-3">
            <div className="flex gap-2.5 min-w-min">
            {availablePlayers.map((player) => {
              const isSelected = selectedPlayers.includes(player);
              return (
                <div
                  key={player}
                  onClick={() => togglePlayer(player)}
                  className={`shrink-0 w-[112px] p-2.5 rounded-xl border cursor-pointer transition-all flex flex-col items-center gap-1.5 select-none ${
                    isSelected
                      ? "bg-[#39FF14]/10 border-[#39FF14] shadow-[0_0_15px_rgba(57,255,20,0.2)]"
                      : "bg-black/20 border-white/10 hover:border-white/30 hover:bg-white/5"
                  }`}
                >
                  <PlayerAvatar
                    name={player}
                    avatarUrl={avatarMap[player]}
                    size={44}
                    isSelected={isSelected}
                    className="rounded-full border border-white/10"
                  />
                  <span
                    className={`font-bold text-xs ${isSelected ? "text-[#39FF14]" : "text-white/70"}`}
                  >
                    {player}
                  </span>
                  {playerStats[player] && (
                    <div className="flex items-center gap-1.5">
                      <span className={`text-[10px] font-bold tabular-nums ${isSelected ? "text-[#39FF14]/70" : "text-white/30"}`}>
                        {playerStats[player].winRate}%
                      </span>
                      {playerStats[player].lastResult !== null && (
                        <span className={`text-[10px] font-bold tabular-nums ${playerStats[player].lastResult! >= 0 ? "text-[#39FF14]/60" : "text-red-400/60"}`}>
                          {playerStats[player].lastResult! >= 0 ? "+" : ""}£{playerStats[player].lastResult!.toFixed(2)}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            </div>
          </div>
          {/* Right-edge gradient — visible only when there's overflow. */}
          <div
            aria-hidden
            className="pointer-events-none absolute top-0 right-0 h-full w-10 bg-gradient-to-l from-[#0E1117] to-transparent"
          />
        </div>
      </div>

      {/* Venue + Blinds + Timer + Buy-in — 2x2 grid on tablets and up */}
      <div className="grid md:grid-cols-2 gap-3 mb-3 shrink-0">
        {/* Venue */}
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-4">
          <div className="flex items-center gap-3 mb-3">
            <MapPin className="text-pink-400" size={18} />
            <h2 className="text-base md:text-lg font-black tracking-widest uppercase">Venue</h2>
          </div>
          <input
            type="text"
            value={venue}
            onChange={(e) => setVenueState(e.target.value)}
            placeholder={DEFAULT_VENUE}
            className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-white font-bold focus:outline-none focus:border-pink-400 focus:ring-1 focus:ring-pink-400 transition-all"
          />
          <p className="text-[11px] text-white/40 mt-2 font-bold tracking-widest uppercase">
            Where the game is being played — saved as your default for next time.
          </p>
        </div>

        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-4">
          <div className="flex items-center gap-3 mb-3">
            <CircleDollarSign className="text-cyan-400" size={18} />
            <h2 className="text-base md:text-lg font-black tracking-widest uppercase">Initial Blinds</h2>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <label className="block text-xs font-bold text-white/50 uppercase mb-1">SB (£)</label>
              <input
                type="number"
                step="0.01"
                value={smallBlind}
                onChange={(e) => setSmallBlind(parseFloat(e.target.value) || 0)}
                className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-white font-bold focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition-all"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-bold text-white/50 uppercase mb-1">BB (£)</label>
              <input
                type="number"
                step="0.01"
                value={bigBlind}
                onChange={(e) => setBigBlind(parseFloat(e.target.value) || 0)}
                className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-white font-bold focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition-all"
              />
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {blindPresets.map((p) => {
              const active = smallBlind === p.sb && bigBlind === p.bb;
              return (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => applyBlindPreset(p.sb, p.bb)}
                  className={`text-xs font-bold tracking-widest uppercase px-2.5 py-1 rounded-xl border transition-colors ${
                    active
                      ? "bg-cyan-400/15 border-cyan-400/60 text-cyan-300"
                      : "bg-black/30 border-white/10 text-white/60 hover:border-cyan-400/40 hover:text-cyan-300"
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          {/* Save Template Button */}
          <div className="mt-4 pt-3 border-t border-white/10">
            <button
              type="button"
              onClick={() => {
                const templateName = `£${smallBlind.toFixed(2)} / £${bigBlind.toFixed(2)} · ${blindTimer}m`;
                saveBlindTemplate({ name: templateName, sb: smallBlind, bb: bigBlind, timerMinutes: blindTimer });
                setTemplates(getBlindTemplates());
                toast.success(`Saved blind template: ${templateName}`);
              }}
              className="text-xs font-bold tracking-widest uppercase px-3 py-1.5 rounded-lg bg-[#39FF14]/10 hover:bg-[#39FF14]/20 border border-[#39FF14]/30 text-[#39FF14] transition-colors"
            >
              Save as Template
            </button>
          </div>

          {/* Saved Templates */}
          {templates.length > 0 && (
            <div className="mt-4 pt-3 border-t border-white/10">
              <p className="text-xs font-bold text-white/40 uppercase mb-2 tracking-widest">Saved Templates</p>
              <div className="flex flex-wrap gap-1.5">
                {templates.map((t) => {
                  const active = smallBlind === t.sb && bigBlind === t.bb && blindTimer === t.timerMinutes;
                  return (
                    <div
                      key={t.name}
                      className={`flex items-center gap-1 text-xs font-bold tracking-widest uppercase px-2.5 py-1 rounded-lg border transition-colors ${
                        active
                          ? "bg-purple-400/15 border-purple-400/60 text-purple-300"
                          : "bg-black/30 border-white/10 text-white/60"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          applyBlindPreset(t.sb, t.bb);
                          setBlindTimer(t.timerMinutes);
                        }}
                        className="hover:text-purple-300 transition-colors"
                      >
                        {t.name}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          deleteBlindTemplate(t.name);
                          setTemplates(getBlindTemplates());
                          toast.success(`Deleted template: ${t.name}`);
                        }}
                        className="ml-1 text-red-400/60 hover:text-red-400 transition-colors"
                        title="Delete template"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-4">
          <div className="flex items-center gap-3 mb-3">
            <Timer className="text-yellow-400" size={18} />
            <h2 className="text-base md:text-lg font-black tracking-widest uppercase">Blind Timer</h2>
          </div>
          <label className="block text-xs font-bold text-white/50 uppercase mb-1">
            Increase every (mins)
          </label>
          <div className="relative">
            <input
              type="number"
              value={blindTimer}
              onChange={(e) => setBlindTimer(Number(e.target.value))}
              className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-white font-bold focus:outline-none focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 transition-all"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 font-bold text-sm">
              MINS
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {timerPresets.map((t) => {
              const active = blindTimer === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setBlindTimer(t)}
                  className={`text-xs font-bold tracking-widest uppercase px-2.5 py-1 rounded-xl border transition-colors ${
                    active
                      ? "bg-yellow-400/15 border-yellow-400/60 text-yellow-300"
                      : "bg-black/30 border-white/10 text-white/60 hover:border-yellow-400/40 hover:text-yellow-300"
                  }`}
                >
                  {t}m
                </button>
              );
            })}
          </div>
        </div>

        {/* Buy-In — applied to every selected player on start */}
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-4">
          <div className="flex items-center gap-3 mb-3">
            <Coins className="text-[#39FF14]" size={18} />
            <h2 className="text-base md:text-lg font-black tracking-widest uppercase">Buy-In</h2>
          </div>
          <label className="block text-xs font-bold text-white/50 uppercase mb-1">
            Pre-fill every player with (£)
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 font-bold text-sm">£</span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={defaultBuyIn === 0 ? "" : defaultBuyIn}
              onChange={(e) => setDefaultBuyIn(parseFloat(e.target.value) || 0)}
              placeholder="0"
              className="w-full bg-black/40 border border-white/10 rounded-xl pl-7 pr-3 py-2 text-white font-bold focus:outline-none focus:border-[#39FF14] focus:ring-1 focus:ring-[#39FF14] transition-all"
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {buyInPresets.map((b) => {
              const active = defaultBuyIn === b;
              return (
                <button
                  key={b}
                  type="button"
                  onClick={() => setDefaultBuyIn(b)}
                  className={`text-xs font-bold tracking-widest uppercase px-2.5 py-1 rounded-xl border transition-colors ${
                    active
                      ? "bg-[#39FF14]/15 border-[#39FF14]/60 text-[#39FF14]"
                      : "bg-black/30 border-white/10 text-white/60 hover:border-[#39FF14]/40 hover:text-[#39FF14]"
                  }`}
                >
                  {b === 0 ? "None" : `£${b}`}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-white/40 mt-2 font-bold tracking-widest uppercase">
            Leave at £0 to start blank — buy-ins can still be edited live.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2 shrink-0">
        <button
          onClick={startGame}
          disabled={selectedPlayers.length < 2}
          className={`w-full py-3.5 rounded-2xl font-black text-lg tracking-widest uppercase flex items-center justify-center gap-3 transition-all ${
            selectedPlayers.length >= 2
              ? "bg-[#39FF14] text-black hover:bg-[#32e011] shadow-[0_0_30px_rgba(57,255,20,0.4)]"
              : "bg-white/10 text-white/30 cursor-not-allowed"
          }`}
        >
          <Play fill="currentColor" size={18} />
          Start Session
        </button>
        {selectedPlayers.length < 2 && (
          <p className="text-center text-xs font-bold tracking-widest uppercase text-red-400/80 animate-pulse mt-1">
            Select at least 2 players to start
          </p>
        )}
      </div>
    </motion.main>
  );
}
