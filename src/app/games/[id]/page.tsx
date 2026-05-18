"use client";

import { useState, useEffect, Suspense, useRef, useMemo } from "react";
import { useSearchParams, useParams } from "next/navigation";
import Link from "next/link";
import {
  Play,
  Pause,
  RotateCcw,
  Pizza,
  CircleDollarSign,
  Check,
  X,
  Settings,
  ArrowRightSquare,
  Plus,
  Skull,
  Crown,
  Keyboard,
  ArrowUp,
  Undo2,
  Volume2,
  VolumeX,
  Users,
} from "lucide-react";
import PlayerAvatar from "@/components/PlayerAvatar";
import {
  clearLiveGameId,
  saveLiveGameState,
  loadLiveGameState,
  type LiveGameSnapshot,
} from "@/lib/live-game-store";
import {
  playLevelUpSound,
  playBustSound,
  playRebuySound,
  playFinalizeSound,
} from "@/lib/sound-pack";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { motion } from "framer-motion";

type PlayerState = {
  name: string;
  avatar_url?: string;
  buyIn: number;
  foodSpend: number;
  cashOut: number | null;
};

type GameEvent = {
  id: number;
  type: "rebuy" | "bust" | "level" | "undo" | "start";
  player?: string;
  amount?: number;
  label: string;
  ts: Date;
};

const REBUY_PRESETS = [10, 20, 50];

function ActiveGameContent() {
  const searchParams = useSearchParams();
  const routeParams = useParams<{ id?: string }>();
  const gameId =
    typeof routeParams?.id === "string"
      ? routeParams.id
      : Array.isArray(routeParams?.id)
        ? routeParams.id[0]
        : "";

  const playersQuery = searchParams.getAll("players");
  const hasPlayersInUrl = playersQuery.length > 0;
  const sbQuery = searchParams.get("sb") || "0.10";
  const bbQuery = searchParams.get("bb") || "0.20";
  const timerQuery = searchParams.get("timer") || "15";
  const buyInQuery = parseFloat(searchParams.get("buyin") || "0") || 0;

  const initialMinutes = parseInt(timerQuery, 10);

  // Load any saved snapshot for this game id once at mount. If present, it
  // overrides the URL-derived initial state so a hard refresh mid-session
  // restores buy-ins, busts, rebuys, the event log, and the timer instead of
  // resetting them. SSR can't read sessionStorage, so the guard keeps the
  // initializer pure on the server side.
  const [restored] = useState<LiveGameSnapshot | null>(() => {
    if (typeof window === "undefined" || !gameId) return null;
    return loadLiveGameState(gameId);
  });

  // Timer State
  const [maxTime, setMaxTime] = useState(restored?.timer.maxTime ?? initialMinutes * 60);
  const [timeLeft, setTimeLeft] = useState(restored?.timer.timeLeft ?? maxTime);
  // Don't auto-resume a running timer after a refresh — the user wasn't at
  // the keyboard for however long, so making the wall clock catch up would
  // be wrong. They can press Space to resume when they're back.
  const [isRunning, setIsRunning] = useState(false);

  // Config Override State
  const [showConfig, setShowConfig] = useState(false);
  const [editSmallBlind, setEditSmallBlind] = useState<number | string>(parseFloat(sbQuery));
  const [editBigBlind, setEditBigBlind] = useState<number | string>(parseFloat(bbQuery));
  const [editTimerMinutes, setEditTimerMinutes] = useState<number | string>(initialMinutes);

  // Blind State
  const [blindLevel, setBlindLevel] = useState(restored?.blinds.blindLevel ?? 1);
  const [smallBlind, setSmallBlind] = useState(
    restored?.blinds.smallBlind ?? parseFloat(sbQuery),
  );
  const [bigBlind, setBigBlind] = useState(
    restored?.blinds.bigBlind ?? parseFloat(bbQuery),
  );

  // Player State — every player starts with the default buy-in supplied on
  // the create form (or 0 to leave blank). Players can still rebuy or edit.
  const [players, setPlayers] = useState<PlayerState[]>(() => {
    if (restored) return restored.players;
    if (playersQuery.length > 0) {
      return playersQuery.map((p) => ({ name: p, buyIn: buyInQuery, foodSpend: 0, cashOut: null }));
    }
    return [
      { name: "Player A", buyIn: buyInQuery, foodSpend: 0, cashOut: null },
      { name: "Player B", buyIn: buyInQuery, foodSpend: 0, cashOut: null },
    ];
  });

  const [showResults, setShowResults] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [events, setEvents] = useState<GameEvent[]>(() => {
    if (restored) {
      return restored.events.map((e) => ({ ...e, ts: new Date(e.ts) }));
    }
    return [{ id: 0, type: "start", label: "Session started", ts: new Date() }];
  });
  const nextEventId = useRef(
    restored ? Math.max(0, ...restored.events.map((e) => e.id)) + 1 : 1,
  );
  const addEvent = (ev: Omit<GameEvent, "id" | "ts">) => {
    setEvents((prev) => [
      { ...ev, id: nextEventId.current++, ts: new Date() },
      ...prev,
    ]);
  };
  const isMutedRef = useRef(false);
  const [isMuted, setIsMuted] = useState(false);
  const [sessionSeconds, setSessionSeconds] = useState(0);

  // All sound cues now live in lib/sound-pack.ts; here we just wrap them
  // with the mute toggle so the call sites stay terse.
  const muted = () => isMutedRef.current;
  const playMoneySound = () => playLevelUpSound({ muted: muted() });

  // Fetch Avatars
  useEffect(() => {
    async function fetchAvatars() {
      try {
        const { data } = await supabase.from("players").select("name, avatar_url");
        if (data) {
          setPlayers((prev) =>
            prev.map((p) => {
              const match = data.find((dbP) => dbP.name === p.name);
              return match ? { ...p, avatar_url: match.avatar_url } : p;
            })
          );
        }
      } catch {
        // ignore
      }
    }
    fetchAvatars();
  }, []);

  // Persist the live game so a hard refresh, accidental tab close, or
  // browser-bar tap doesn't wipe the in-progress session. We snapshot every
  // time the user-visible state changes (rebuy, bust, blind change, etc.).
  // The timer's per-second `timeLeft` tick is intentionally excluded so we
  // don't write to sessionStorage every second; on refresh the timer is
  // paused anyway and the level + blinds are restored.
  useEffect(() => {
    if (showResults || !gameId) return;
    const snapshot: LiveGameSnapshot = {
      v: 1,
      players,
      events: events.map((e) => ({ ...e, ts: e.ts.toISOString() })),
      timer: { maxTime, timeLeft, isRunning: false },
      blinds: { smallBlind, bigBlind, blindLevel },
    };
    saveLiveGameState(gameId, snapshot);
    // `timeLeft` is intentionally omitted from the dependency list — it ticks
    // every second and would otherwise spam sessionStorage. The restored
    // value is the level's full duration anyway.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, players, events, maxTime, smallBlind, bigBlind, blindLevel, showResults]);

  // Session elapsed clock — capture the start time inside the effect so we
  // never read `Date.now()` during render (impure) or touch a ref outside an
  // effect/handler.
  useEffect(() => {
    const start = Date.now();
    const interval = setInterval(() => {
      setSessionSeconds(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const formatSessionTime = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  // Timer Tick — drive both the countdown and the "expired" side effects from
  // inside the interval callback so we never call setState synchronously from
  // the effect body (react-hooks/set-state-in-effect).
  useEffect(() => {
    if (!isRunning) return;
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setIsRunning(false);
          playMoneySound();
          toast.warning("Blind level expired — bump the blinds!", { duration: 6000 });
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isRunning]);

  // Keyboard Shortcuts: Space toggle, R reset, B advance level, ? help
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Always allow Escape to close modals
      if (e.key === "Escape") {
        if (showConfig) { setShowConfig(false); return; }
        if (showHelp) { setShowHelp(false); return; }
      }

      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable) {
        return;
      }
      if (showResults || showConfig) return;

      if (e.code === "Space") {
        e.preventDefault();
        // Mirror the click button's behaviour: if expired, advance to the next
        // blind level; otherwise just toggle running state.
        if (timeLeft === 0) {
          const nextSb = Number((smallBlind * 2).toFixed(2));
          const nextBb = Number((bigBlind * 2).toFixed(2));
          setSmallBlind(nextSb);
          setBigBlind(nextBb);
          setTimeLeft(maxTime);
          setBlindLevel((prev) => prev + 1);
          setIsRunning(true);
          toast.success(`Level up — blinds now £${nextSb.toFixed(2)} / £${nextBb.toFixed(2)}`);
          addEvent({
            type: "level",
            label: `Level ${blindLevel + 1} · £${nextSb.toFixed(2)}/£${nextBb.toFixed(2)}`,
          });
        } else {
          setIsRunning((r) => !r);
        }
      } else if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        setIsRunning(false);
        setTimeLeft(maxTime);
      } else if (e.key === "b" || e.key === "B") {
        e.preventDefault();
        setEditSmallBlind(Number((smallBlind * 2).toFixed(2)));
        setEditBigBlind(Number((bigBlind * 2).toFixed(2)));
        setEditTimerMinutes(Math.round(maxTime / 60));
        setShowConfig(true);
      } else if (e.key === "?") {
        e.preventDefault();
        setShowHelp((h) => !h);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [showResults, showConfig, showHelp, maxTime, smallBlind, bigBlind, timeLeft, blindLevel]);

  // When the timer is expired, "Start" auto-advances to the next blind level
  // (doubles SB/BB, keeps the same level duration) and resumes — saves a trip
  // to the config dialog when you just want to keep the game moving.
  const advanceToNextLevel = () => {
    const nextSb = Number((smallBlind * 2).toFixed(2));
    const nextBb = Number((bigBlind * 2).toFixed(2));
    setSmallBlind(nextSb);
    setBigBlind(nextBb);
    setTimeLeft(maxTime);
    setBlindLevel((prev) => prev + 1);
    setIsRunning(true);
    toast.success(`Level up — blinds now £${nextSb.toFixed(2)} / £${nextBb.toFixed(2)}`);
    addEvent({
      type: "level",
      label: `Level ${blindLevel + 1} · £${nextSb.toFixed(2)}/£${nextBb.toFixed(2)}`,
    });
  };

  const toggleTimer = () => {
    if (timeLeft === 0) {
      advanceToNextLevel();
      return;
    }
    setIsRunning((r) => !r);
  };
  const resetTimer = () => {
    setIsRunning(false);
    setTimeLeft(maxTime);
  };
  const openConfig = () => {
    setEditSmallBlind(Number((smallBlind * 2).toFixed(2)));
    setEditBigBlind(Number((bigBlind * 2).toFixed(2)));
    setEditTimerMinutes(Math.round(maxTime / 60));
    setShowConfig(true);
  };

  const applyConfig = () => {
    const sb = parseFloat(editSmallBlind as string) || 0;
    const bb = parseFloat(editBigBlind as string) || 0;
    const tm = parseInt(editTimerMinutes as string) || 0;

    if (bb <= sb) {
      toast.error("Big blind must be greater than the small blind.");
      return;
    }

    setSmallBlind(sb);
    setBigBlind(bb);

    const newMax = tm * 60;
    setTimeLeft(newMax);
    setMaxTime(newMax);
    setIsRunning(false);

    setBlindLevel((prev) => prev + 1);
    setShowConfig(false);
    toast.success(`Level advanced — now £${sb.toFixed(2)} / £${bb.toFixed(2)}`);
    addEvent({ type: "level", label: `Level ${blindLevel + 1} · £${sb.toFixed(2)}/£${bb.toFixed(2)}` });
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const setPlayerInput = (name: string, field: keyof PlayerState, val: string) => {
    setPlayers((prev) =>
      prev.map((p) => {
        if (p.name !== name) return p;
        // Clamp to >= 0 across the board — there's no legitimate negative
        // buy-in, cash-out, or food spend, and accepting one silently lets
        // the chip-mismatch check downstream paper over a typo by
        // proportional rescaling.
        if (field === "cashOut") {
          if (val === "") return { ...p, cashOut: null };
          const num = parseFloat(val);
          if (!Number.isFinite(num) || num < 0) return { ...p, cashOut: 0 };
          return { ...p, cashOut: num };
        }
        if (val === "") return { ...p, [field]: 0 };
        const num = parseFloat(val);
        if (!Number.isFinite(num) || num < 0) return { ...p, [field]: 0 };
        return { ...p, [field]: num };
      })
    );
  };

  const bustPlayer = (name: string) => {
    setPlayers((prev) => prev.map((p) => (p.name === name ? { ...p, cashOut: 0 } : p)));
    playBustSound({ muted: muted() });
    toast(`${name} busted out — cash-out set to £0.`, { icon: "💀" });
    addEvent({ type: "bust", player: name, label: `${name} busted out` });
  };

  const undoBust = (name: string) => {
    setPlayers((prev) => prev.map((p) => (p.name === name ? { ...p, cashOut: null } : p)));
    addEvent({ type: "undo", player: name, label: `${name} bust undone` });
  };

  const rebuyPlayer = (name: string, amount: number) => {
    setPlayers((prev) =>
      prev.map((p) =>
        p.name === name ? { ...p, buyIn: Number((p.buyIn + amount).toFixed(2)) } : p
      )
    );
    playRebuySound({ muted: muted() });
    addEvent({ type: "rebuy", player: name, amount, label: `${name} rebuyed +£${amount}` });
  };

  const totalBuyIns = players.reduce((sum, p) => sum + p.buyIn, 0);
  const totalCashOuts = players.reduce((sum, p) => sum + (p.cashOut || 0), 0);

  const stillIn = players.filter((p) => p.cashOut === null);
  const chipLeader =
    stillIn.length > 0
      ? stillIn.reduce((best, p) => (p.buyIn > best.buyIn ? p : best), stillIn[0])
      : null;

  const calculateResults = () => {
    const missing = players.filter((p) => p.cashOut === null);
    if (missing.length > 0) {
      toast.error(
        `Missing Cash Out values for: ${missing.map((m) => m.name).join(", ")}. If they busted, hit BUST.`
      );
      return;
    }

    if (Math.abs(totalBuyIns - totalCashOuts) > 0.01) {
      toast.error(
        `CHIP MISMATCH ALERT! \nBuy-ins: £${totalBuyIns.toFixed(2)} | Cash Outs: £${totalCashOuts.toFixed(2)} \nDifference: £${Math.abs(totalBuyIns - totalCashOuts).toFixed(2)}`,
        {
          duration: 12000,
          action: {
            label: "Auto-Balance",
            onClick: () => {
              // Scale all cash-outs so total matches total buy-ins
              const targetCashOut = totalBuyIns;
              const currentCashOut = totalCashOuts;
              if (currentCashOut <= 0) return;
              const scale = targetCashOut / currentCashOut;
              setPlayers((prev) =>
                prev.map((p) =>
                  p.cashOut !== null
                    ? { ...p, cashOut: Number((p.cashOut * scale).toFixed(2)) }
                    : p
                )
              );
              toast.success("Cash-outs auto-balanced — please verify and re-finalize.");
            },
          },
        }
      );
      return;
    }

    setShowResults(true);
    playFinalizeSound({ muted: muted() });
    clearLiveGameId();
  };

  const fillPct = Math.max(0, Math.min(100, (timeLeft / (maxTime || 1)) * 100));
  const lowTime = timeLeft > 0 && timeLeft < 60;
  const expired = timeLeft === 0;

  // ===================== Spreadsheet ROW (memo) =====================
  const tableBody = useMemo(() => {
    return players.map((p) => {
      const cashedOut = p.cashOut !== null;
      const isLeader = chipLeader?.name === p.name && stillIn.length > 1;
      const net = (p.cashOut ?? 0) - p.buyIn - p.foodSpend;
      return (
        <tr
          key={p.name}
          className={`group border-b border-white/5 last:border-b-0 transition-colors ${
            cashedOut ? "opacity-60 bg-black/20" : "hover:bg-white/[0.03]"
          }`}
        >
          {/* Player */}
          <td className="px-3 md:px-4 py-4 sticky left-0 bg-[#0E1117] group-hover:bg-[#161a22] z-10">
            <div className="flex items-center gap-2.5 min-w-0">
              <PlayerAvatar
                name={p.name}
                avatarUrl={p.avatar_url}
                size={52}
                className="rounded-full border border-white/10 shrink-0"
              />
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-lg font-bold truncate">{p.name}</span>
                {isLeader && (
                  <Crown
                    size={12}
                    className="text-yellow-400 drop-shadow-[0_0_6px_rgba(250,204,21,0.6)] shrink-0"
                  />
                )}
              </div>
            </div>
          </td>

          {/* Buy-in */}
          <td className="px-2 py-4">
            <div className="relative w-28 ml-auto">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 font-bold text-white/40 text-sm">
                £
              </span>
              <input
                type="number"
                step="0.01"
                value={p.buyIn === 0 ? "" : p.buyIn}
                onChange={(e) => setPlayerInput(p.name, "buyIn", e.target.value)}
                placeholder="0"
                className="w-full bg-black/40 border border-white/10 rounded-md py-1 pl-5 pr-2 font-bold text-base md:text-lg text-[#39FF14] focus:outline-none focus:border-[#39FF14] focus:ring-1 focus:ring-[#39FF14] transition-all text-right tabular-nums"
              />
            </div>
          </td>

          {/* Rebuy chips */}
          <td className="px-2 py-4">
            {!cashedOut && (
              <div className="flex gap-1 justify-center">
                {REBUY_PRESETS.map((amt) => (
                  <button
                    key={amt}
                    onClick={() => rebuyPlayer(p.name, amt)}
                    title={`Add £${amt} to buy-in`}
                    className="text-sm font-bold tracking-wider uppercase px-2 py-1 rounded-xl bg-[#39FF14]/5 hover:bg-[#39FF14]/15 border border-[#39FF14]/20 hover:border-[#39FF14]/50 text-[#39FF14] transition-colors flex items-center gap-0.5"
                  >
                    <Plus size={9} />
                    {amt}
                  </button>
                ))}
              </div>
            )}
          </td>

          {/* Food */}
          <td className="px-2 py-4">
            <div className="relative w-28 ml-auto">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 font-bold text-white/40 text-sm">
                £
              </span>
              <input
                type="number"
                step="0.01"
                value={p.foodSpend === 0 ? "" : p.foodSpend}
                onChange={(e) => setPlayerInput(p.name, "foodSpend", e.target.value)}
                placeholder="0"
                className="w-full bg-black/40 border border-white/10 rounded-md py-1 pl-5 pr-2 font-bold text-base md:text-lg text-yellow-400 focus:outline-none focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 transition-all text-right tabular-nums"
              />
            </div>
          </td>

          {/* Cash Out */}
          <td className="px-2 py-4">
            <div className="relative w-28 ml-auto">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 font-bold text-white/40 text-sm">
                £
              </span>
              <input
                type="number"
                step="0.01"
                value={p.cashOut === null ? "" : p.cashOut}
                onChange={(e) => setPlayerInput(p.name, "cashOut", e.target.value)}
                placeholder="—"
                className="w-full bg-black/40 border border-white/10 rounded-md py-1 pl-5 pr-2 font-bold text-base md:text-lg text-white focus:outline-none focus:border-red-400 focus:ring-1 focus:ring-red-400 transition-all text-right tabular-nums"
              />
            </div>
          </td>

          {/* Net */}
          <td className="px-2 py-4 text-right">
            {cashedOut ? (
              <span
                className={`text-lg font-black tabular-nums ${
                  net >= 0 ? "text-[#39FF14]" : "text-red-400"
                }`}
              >
                {net >= 0 ? "+" : ""}£{net.toFixed(2)}
              </span>
            ) : (
              <span className="text-sm font-mono text-white/25 tabular-nums">-£{p.buyIn.toFixed(2)}</span>
            )}
          </td>

          {/* Action */}
          <td className="px-2 py-4 pr-3 md:pr-4">
            <div className="flex justify-end">
              {cashedOut ? (
                <button
                  onClick={() => undoBust(p.name)}
                  title="Undo cash-out"
                  className="text-xs flex items-center gap-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 font-bold px-2 py-1 rounded-xl uppercase tracking-wider border border-red-500/30"
                >
                  <Undo2 size={10} /> Undo
                </button>
              ) : (
                <button
                  onClick={() => bustPlayer(p.name)}
                  title="Mark as busted (cash-out £0)"
                  className="text-xs flex items-center gap-1 bg-white/5 text-white/60 hover:bg-red-500/15 hover:text-red-400 hover:border-red-500/30 font-bold px-2 py-1 rounded-xl uppercase tracking-wider border border-white/10 transition-colors"
                >
                  <Skull size={10} /> Bust
                </button>
              )}
            </div>
          </td>
        </tr>
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players, chipLeader?.name, stillIn.length]);

  // The "no players" fallback only fires when the URL is empty AND we don't
  // have a restored snapshot — otherwise a hard refresh that loses the
  // query string but kept the sessionStorage snapshot would dump the user
  // back to the create-game CTA and lose their session.
  if (!hasPlayersInUrl && !restored) {
    return (
      <main className="flex-1 min-h-0 flex items-center justify-center px-6 py-10 text-[#FAFAFA]">
        <div className="max-w-md w-full text-center bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#39FF14]/10 border border-[#39FF14]/20 mb-5">
            <Users className="text-[#39FF14]" size={28} />
          </div>
          <h2 className="text-2xl font-black tracking-tight uppercase mb-2">No Players</h2>
          <p className="text-white/50 mb-6 text-base">This session has no players configured. Set up a new game to start tracking.</p>
          <Link
            href="/games/create"
            className="inline-flex items-center gap-2 px-6 py-3 bg-[#39FF14] text-black font-black tracking-widest uppercase rounded-2xl shadow-[0_0_30px_rgba(57,255,20,0.4)] hover:shadow-[0_0_40px_rgba(57,255,20,0.6)] transition-shadow"
          >
            <Plus size={18} />
            Configure Session
          </Link>
        </div>
      </main>
    );
  }

  if (showResults) {
    const ranked = [...players]
      .map((p) => ({ ...p, net: (p.cashOut || 0) - p.buyIn - p.foodSpend }))
      .sort((a, b) => b.net - a.net);

    return (
      <main className="flex-1 min-h-0 overflow-auto px-6 xl:px-12 py-6 text-[#FAFAFA]">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-4 mb-6">
            <div className="p-3 bg-[#39FF14]/10 rounded-xl border border-[#39FF14]/20">
              <Check className="text-[#39FF14]" size={24} />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-black tracking-tight uppercase leading-none">
                Game Finalized
              </h1>
              <p className="text-white/50 mt-1 text-base">Final settlement report.</p>
            </div>
          </div>

          {/* Mobile portrait can't fit 5 money columns side-by-side. Wrapping
              the grid in a horizontal scroll container with a min-width keeps
              every column readable instead of being crushed off-screen. */}
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
            <div className="overflow-x-auto">
              <div className="min-w-[640px]">
                <div className="grid grid-cols-5 gap-4 px-5 py-3 border-b border-white/10 bg-black/40 text-sm font-bold text-white/40 uppercase tracking-wider">
                  <div>Player</div>
                  <div className="text-right">Buy-in</div>
                  <div className="text-right">Cash Out</div>
                  <div className="text-right border-x border-white/10 px-3">Game Profit</div>
                  <div className="text-right text-[#39FF14]">Total w/ Food</div>
                </div>
                <div className="divide-y divide-white/5">
                  {ranked.map((p, i) => {
                    const gameNet = (p.cashOut || 0) - p.buyIn;
                    return (
                      <div
                        key={p.name}
                        className="grid grid-cols-5 gap-4 px-5 py-3 items-center hover:bg-white/5 transition-colors"
                      >
                        <div className="font-bold flex items-center gap-2">
                          {i === 0 && <Crown size={14} className="text-yellow-400" />}
                          <span>{p.name}</span>
                        </div>
                        <div className="text-right text-white/70 text-base">£{p.buyIn.toFixed(2)}</div>
                        <div className="text-right text-white/70 text-base">£{(p.cashOut || 0).toFixed(2)}</div>
                        <div
                          className={`text-right border-x border-white/10 px-3 font-black ${
                            gameNet >= 0 ? "text-white" : "text-red-400"
                          }`}
                        >
                          {gameNet > 0 ? "+" : ""}£{gameNet.toFixed(2)}
                        </div>
                        <div
                          className={`text-right font-black text-xl ${
                            p.net >= 0 ? "text-[#39FF14]" : "text-red-400"
                          }`}
                        >
                          {p.net > 0 ? "+" : ""}£{p.net.toFixed(2)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-5 flex justify-end gap-3">
            <button
              onClick={() => setShowResults(false)}
              className="px-5 py-3 bg-white/5 hover:bg-white/10 transition-colors rounded-xl font-bold tracking-widest uppercase border border-white/10 text-base"
            >
              Back to Table
            </button>
            <Link href="/" onClick={() => clearLiveGameId()}>
              <button className="px-6 py-3 bg-[#39FF14]/10 border border-[#39FF14]/40 text-[#39FF14] hover:bg-[#39FF14]/20 transition-colors rounded-xl font-black tracking-widest uppercase shadow-xl text-base">
                Return to Dashboard
              </button>
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 md:min-h-0 md:overflow-hidden text-[#FAFAFA] flex flex-col xl:flex-row gap-3 px-3 md:px-6 xl:px-8 py-3">
      {/* LEFT COLUMN — Timer + Audit + End */}
      <aside className="xl:w-[340px] shrink-0 flex flex-col gap-3 min-h-0">
        {/* Timer Card with gradient drain */}
        <div
          className={`relative rounded-2xl border overflow-hidden shrink-0 transition-colors ${
            expired
              ? "border-red-500/60"
              : lowTime
                ? "border-yellow-400/60"
                : "border-white/10"
          }`}
          style={{ minHeight: 240 }}
        >
          {/* Gradient drain — anchored bottom, shrinks upward as time depletes */}
          <div
            aria-hidden
            className={`absolute inset-x-0 bottom-0 transition-[height] duration-1000 ease-linear pointer-events-none ${
              expired ? "bg-red-500/20" : lowTime ? "bg-yellow-400/[0.18]" : "bg-[#39FF14]/15"
            }`}
            style={{ height: `${fillPct}%` }}
          />
          {/* Subtle moving sheen on the drain edge */}
          <div
            aria-hidden
            className="absolute inset-x-0 h-[2px] pointer-events-none transition-all duration-1000 ease-linear"
            style={{
              bottom: `${fillPct}%`,
              background:
                expired
                  ? "linear-gradient(90deg, transparent, rgba(239,68,68,0.8), transparent)"
                  : lowTime
                    ? "linear-gradient(90deg, transparent, rgba(250,204,21,0.8), transparent)"
                    : "linear-gradient(90deg, transparent, rgba(57,255,20,0.8), transparent)",
              boxShadow: expired
                ? "0 0 12px rgba(239,68,68,0.6)"
                : lowTime
                  ? "0 0 12px rgba(250,204,21,0.6)"
                  : "0 0 12px rgba(57,255,20,0.6)",
            }}
          />
          {/* Background base */}
          <div className="absolute inset-0 bg-white/5 backdrop-blur-xl pointer-events-none -z-10" />

          {/* Card content */}
          <div className="relative z-10 p-5 flex flex-col items-center justify-center h-full min-h-[240px]">
            <div className="absolute top-3 left-3 right-3 flex items-center justify-between">
              <button
                onClick={() => setShowHelp(true)}
                className="text-white/40 hover:text-white transition-colors p-1"
                title="Keyboard shortcuts (?)"
                aria-label="Show keyboard shortcuts"
              >
                <Keyboard size={15} />
              </button>
              <button
                onClick={openConfig}
                className="text-white/40 hover:text-white transition-colors p-1"
                title="Edit configuration (B)"
              >
                <Settings size={16} />
              </button>
            </div>

            <p className="text-white/50 font-bold tracking-widest uppercase text-xs mb-1">
              Level {blindLevel}
            </p>
            <div
              className={`text-5xl md:text-6xl font-black tracking-tighter drop-shadow-lg tabular-nums mb-1 ${
                expired ? "text-red-500 animate-pulse" : lowTime ? "text-yellow-300" : "text-white"
              }`}
            >
              {formatTime(timeLeft)}
            </div>
            <p className="text-lg font-black text-cyan-300 tracking-widest">
              £{smallBlind.toFixed(2)} / £{bigBlind.toFixed(2)}
            </p>
            <p className="text-[11px] font-bold tracking-widest text-white/40 uppercase mt-1 flex items-center gap-1">
              <ArrowUp size={9} className="text-cyan-400/70" />
              Next: £{(smallBlind * 2).toFixed(2)} / £{(bigBlind * 2).toFixed(2)}
            </p>

            <div className="flex gap-2 w-full mt-4">
              <button
                onClick={toggleTimer}
                className={`flex-1 py-2.5 rounded-xl flex items-center justify-center gap-2 text-base font-bold tracking-widest uppercase transition-all ${
                  isRunning
                    ? "bg-red-500/20 text-red-400 border border-red-500/50 hover:bg-red-500/30"
                    : expired
                      ? "bg-cyan-400/20 text-cyan-300 border border-cyan-400/50 hover:bg-cyan-400/30"
                      : "bg-[#39FF14]/20 text-[#39FF14] border border-[#39FF14]/50 hover:bg-[#39FF14]/30"
                }`}
                title={expired ? "Double the blinds and start the next level" : undefined}
              >
                {isRunning ? (
                  <Pause size={16} />
                ) : expired ? (
                  <ArrowUp size={16} />
                ) : (
                  <Play fill="currentColor" size={16} />
                )}
                {isRunning ? "Pause" : expired ? "Next Level" : "Start"}
              </button>
              <button
                onClick={resetTimer}
                className="w-12 flex items-center justify-center rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
                title="Reset (R)"
              >
                <RotateCcw size={16} />
              </button>
              <button
                onClick={() => {
                  const next = !isMutedRef.current;
                  isMutedRef.current = next;
                  setIsMuted(next);
                }}
                className="w-12 flex items-center justify-center rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
                title={isMuted ? "Unmute sound" : "Mute sound"}
              >
                {isMuted ? <VolumeX size={16} className="text-white/30" /> : <Volume2 size={16} className="text-white/70" />}
              </button>
            </div>
          </div>
        </div>

        {/* Audit */}
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-4 shadow-lg shrink-0">
          <div className="flex items-center justify-between mb-2.5">
            <h3 className="text-white/50 font-bold tracking-widest uppercase text-xs">
              Table Audit
            </h3>
            {chipLeader && stillIn.length > 1 && (
              <span className="flex items-center gap-1 text-xs font-bold tracking-widest uppercase text-yellow-400">
                <Crown size={10} /> {chipLeader.name}
              </span>
            )}
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between items-center text-sm">
              <span className="text-white/60">Buy-ins</span>
              <span className="font-bold text-[#39FF14]">£{totalBuyIns.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-white/60">Cashed Out</span>
              <span className="font-bold text-white">£{totalCashOuts.toFixed(2)}</span>
            </div>
            <div className="pt-2 border-t border-white/10 flex justify-between items-center">
              <span className="text-xs font-bold uppercase tracking-wider text-white/50">
                Chips on Table
              </span>
              <span className="font-black text-lg text-cyan-400 tabular-nums">
                £{(totalBuyIns - totalCashOuts).toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between items-center text-xs tracking-widest uppercase font-bold text-white/30">
              <span>Still In</span>
              <span>{stillIn.length} / {players.length}</span>
            </div>
            <div className="flex justify-between items-center text-xs tracking-widest uppercase font-bold text-white/30 pt-1">
              <span>Session</span>
              <span className="font-mono">{formatSessionTime(sessionSeconds)}</span>
            </div>
          </div>
        </div>

        {/* Event Log */}
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden md:flex-1 md:min-h-0 flex flex-col max-h-[280px] md:max-h-none">
          <div className="px-4 py-2.5 border-b border-white/10 flex items-center justify-between shrink-0">
            <h3 className="text-base md:text-lg font-black tracking-widest uppercase text-white/70">Events</h3>
            <span className="text-xs font-mono text-white/30">{events.length}</span>
          </div>
          <div role="log" aria-live="polite" aria-label="Game events" className="md:flex-1 md:min-h-0 overflow-auto p-2 flex flex-col gap-1">
            {events.map((ev) => {
              const color =
                ev.type === "rebuy" ? "text-[#39FF14]" :
                ev.type === "bust" ? "text-red-400" :
                ev.type === "level" ? "text-cyan-400" :
                ev.type === "undo" ? "text-yellow-400" :
                "text-white/40";
              const icon =
                ev.type === "rebuy" ? "+" :
                ev.type === "bust" ? "✕" :
                ev.type === "level" ? "▲" :
                ev.type === "undo" ? "↩" : "·";
              return (
                <div key={ev.id} className="flex items-start gap-2 px-2 py-1.5 rounded-lg hover:bg-white/[0.03] transition-colors">
                  <span className={`text-sm font-black ${color} shrink-0 w-4 text-center`}>{icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white/70 truncate">{ev.label}</p>
                  </div>
                  <span className="text-xs font-mono text-white/20 shrink-0">
                    {ev.ts.getHours().toString().padStart(2,"0")}:{ev.ts.getMinutes().toString().padStart(2,"0")}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <button
          onClick={calculateResults}
          className="w-full py-3 rounded-xl border-2 border-[#39FF14]/50 bg-[#39FF14]/10 text-[#39FF14] font-black tracking-widest uppercase hover:bg-[#39FF14]/20 hover:shadow-[0_0_30px_rgba(57,255,20,0.3)] transition-all text-base shrink-0"
        >
          End Game
        </button>
      </aside>

      {/* RIGHT — Spreadsheet */}
      <section className="md:flex-1 md:min-h-0 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden flex flex-col">
        <div className="px-4 py-2.5 border-b border-white/10 flex items-center justify-between shrink-0 bg-black/30">
          <h2 className="text-base md:text-lg font-black tracking-widest uppercase text-white/70">Live Table</h2>
          <span className="text-xs font-mono tracking-widest uppercase text-white/30">
            {players.length} players
          </span>
        </div>

        <div className="md:flex-1 md:min-h-0 overflow-x-auto md:overflow-auto">
          <table className="w-full min-w-[640px] border-collapse">
            <thead className="sticky top-0 z-20 bg-black/60 backdrop-blur-md">
              <tr className="border-b border-white/10 text-sm font-bold uppercase tracking-widest text-white/40">
                <th className="text-left px-3 md:px-4 py-2.5 sticky left-0 bg-black/60 z-30">
                  <div className="flex items-center gap-2">
                    <CircleDollarSign size={11} className="text-white/30" /> Player
                  </div>
                </th>
                <th className="text-right px-2 py-2.5">Buy-in</th>
                <th className="text-center px-2 py-2.5">Rebuy</th>
                <th className="text-right px-2 py-2.5">
                  <span className="inline-flex items-center gap-1">
                    <Pizza size={11} className="text-yellow-400/70" /> Food
                  </span>
                </th>
                <th className="text-right px-2 py-2.5">
                  <span className="inline-flex items-center gap-1">
                    <ArrowRightSquare size={11} className="text-red-400/70" /> Cash Out
                  </span>
                </th>
                <th className="text-right px-2 py-2.5">Profit</th>
                <th className="text-right px-2 py-2.5 pr-3 md:pr-4">Action</th>
              </tr>
            </thead>
            <tbody>{tableBody}</tbody>
          </table>
        </div>
      </section>

      {/* Edit Config Modal */}
      {showConfig && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex items-center justify-center p-6"
        >
          <motion.div
            initial={{ scale: 0.95 }}
            animate={{ scale: 1 }}
            className="bg-[#0E1117] border border-white/10 rounded-3xl max-w-sm w-full p-6 md:p-7 relative shadow-[0_0_50px_rgba(0,0,0,0.5)] max-h-[90vh] overflow-y-auto"
          >
            <button
              onClick={() => setShowConfig(false)}
              className="absolute top-5 right-5 text-white/50 hover:text-white inline-flex items-center justify-center w-9 h-9 rounded-md hover:bg-white/5 transition-colors"
              aria-label="Close"
            >
              <X size={22} />
            </button>

            <h2 className="text-2xl font-black tracking-tight mb-1 uppercase pr-10">Advance Level</h2>
            <p className="text-white/50 mb-1 text-base">Pre-filled at 2× current blinds.</p>
            <p className="text-xs text-white/30 font-mono uppercase tracking-widest mb-5">
              currently £{smallBlind.toFixed(2)} / £{bigBlind.toFixed(2)} · level {blindLevel}
            </p>

            <div className="space-y-5">
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-bold text-white/50 uppercase mb-1.5">
                    Small Blind (£)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={editSmallBlind}
                    onChange={(e) => setEditSmallBlind(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-white font-bold focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition-all"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-bold text-white/50 uppercase mb-1.5">
                    Big Blind (£)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={editBigBlind}
                    onChange={(e) => setEditBigBlind(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-white font-bold focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-white/50 uppercase mb-1.5">
                  Timer (Minutes)
                </label>
                <input
                  type="number"
                  value={editTimerMinutes}
                  onChange={(e) => setEditTimerMinutes(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-white font-bold focus:outline-none focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 transition-all"
                />
              </div>
            </div>

            <button
              onClick={applyConfig}
              className="mt-6 w-full py-3 rounded-xl bg-cyan-400/20 border border-cyan-400/50 text-cyan-400 font-black tracking-widest uppercase hover:bg-cyan-400/30 transition-all shadow-lg"
            >
              Apply & Advance Level
            </button>
          </motion.div>
        </motion.div>
      )}

      {/* Help Modal */}
      {showHelp && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex items-center justify-center p-6"
          onClick={() => setShowHelp(false)}
        >
          <motion.div
            initial={{ scale: 0.95 }}
            animate={{ scale: 1 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-[#0E1117] border border-white/10 rounded-3xl max-w-sm w-full p-6 md:p-7 relative max-h-[90vh] overflow-y-auto"
          >
            <button
              onClick={() => setShowHelp(false)}
              className="absolute top-5 right-5 text-white/50 hover:text-white inline-flex items-center justify-center w-9 h-9 rounded-md hover:bg-white/5 transition-colors"
              aria-label="Close"
            >
              <X size={22} />
            </button>
            <h2 className="text-xl font-black tracking-tight mb-5 uppercase flex items-center gap-3 pr-10">
              <Keyboard size={20} className="text-[#39FF14]" /> Shortcuts
            </h2>
            <ul className="space-y-2.5 text-base">
              {[
                ["Space", "Start / pause the timer"],
                ["R", "Reset the current level timer"],
                ["B", "Open level-advance dialog"],
                ["?", "Toggle this help"],
              ].map(([key, label]) => (
                <li key={key} className="flex items-center justify-between gap-4">
                  <span className="text-white/70">{label}</span>
                  <kbd className="font-mono text-sm font-bold tracking-wider px-2 py-0.5 rounded bg-white/5 border border-white/10 text-[#39FF14] uppercase">
                    {key}
                  </kbd>
                </li>
              ))}
            </ul>
          </motion.div>
        </motion.div>
      )}
    </main>
  );
}

export default function ActiveGamePage() {
  return (
    <Suspense
      fallback={
        <div className="flex-1 flex items-center justify-center text-[#39FF14] font-black text-2xl tracking-widest animate-pulse">
          LOADING SESSION...
        </div>
      }
    >
      <ActiveGameContent />
    </Suspense>
  );
}
