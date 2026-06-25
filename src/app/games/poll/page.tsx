"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeft, Calendar as CalendarIcon, ChevronRight, Lock, ShieldAlert,
  Check, X, HelpCircle, Users, Trophy
} from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isAdmin } from "@/lib/auth";
import { Poll, PollOption, Rsvp, PollWithDetails, RsvpResponse, OptionTally, tallyPoll, nextMonthlyBoundaryPair } from "@/lib/polls";
import { toast } from "sonner";

type UserMap = Record<string, { player_name: string; avatar_url: string | null }>;

export default function PollsCalendarPage() {
  const supabase = createSupabaseBrowserClient();

  const [baseDate, setBaseDate] = useState(() => {
    const d = new Date();
    d.setHours(0,0,0,0);
    d.setDate(1);
    return d;
  });
  const [pollsAggregated, setPollsAggregated] = useState<PollWithDetails | null>(null);
  const [missingYears, setMissingYears] = useState<number[]>([]);
  const [users, setUsers] = useState<UserMap>({});
  const [me, setMe] = useState<{ id: string } | null>(null);
  const [iAmAdmin, setIAmAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [initializing, setInitializing] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const startYear = baseDate.getFullYear();
      const endMonth = new Date(baseDate);
      endMonth.setMonth(endMonth.getMonth() + 5);
      const endYear = endMonth.getFullYear();

      const requiredYears = Array.from(new Set([startYear, endYear]));
      const requiredIsos = requiredYears.map(y => `${y}-01-01`);

      const { data: pollsData } = await supabase
        .from("polls")
        .select("*")
        .in("weekend_start_date", requiredIsos);

      const foundYears = (pollsData || []).map(p => new Date(p.weekend_start_date).getFullYear());
      const missing = requiredYears.filter(y => !foundYears.includes(y));
      setMissingYears(missing);

      if (!pollsData || pollsData.length === 0) {
        setPollsAggregated(null);
        setLoading(false);
        return;
      }

      const pollIds = pollsData.map(p => p.id);

      const [{ data: optionsData }, { data: rsvpsData }, { data: usersData }, { data: playersData }] = await Promise.all([
        supabase.from("poll_options").select("*").in("poll_id", pollIds).order("game_date"),
        supabase.from("rsvps").select("*").in("poll_id", pollIds),
        supabase.from("users").select("user_id, player_name"),
        supabase.from("players").select("name, avatar_url"),
      ]);

      setPollsAggregated({
        ...(pollsData[0] as Poll),
        id: "aggregated",
        options: (optionsData as PollOption[]) ?? [],
        rsvps: (rsvpsData as Rsvp[]) ?? [],
      });

      const map: UserMap = {};
      const playerAvatars: Record<string, string | null> = {};
      (playersData ?? []).forEach((p: { name: string; avatar_url: string | null }) => {
        playerAvatars[p.name] = p.avatar_url;
      });

      (usersData ?? []).forEach((u: { user_id: string; player_name: string }) => {
        map[u.user_id] = { player_name: u.player_name, avatar_url: playerAvatars[u.player_name] || null };
      });
      setUsers(map);
    } catch (err) {
      console.error("[polls] load failed:", err);
    } finally {
      setLoading(false);
    }
  }, [supabase, baseDate]);

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      const { data } = await supabase.auth.getUser();
      if (cancelled) return;
      setMe(data.user ? { id: data.user.id } : null);

      if (data.user?.email) {
        if (isAdmin(data.user.email)) {
          setIAmAdmin(true);
        } else {
          const { data: profile } = await supabase
            .from("users")
            .select("is_admin")
            .eq("email", data.user.email)
            .maybeSingle();
          if (!cancelled) setIAmAdmin(profile?.is_admin === true);
        }
      }

      await loadData();
    };
    init();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (cancelled) return;
        setMe(session?.user ? { id: session.user.id } : null);
        loadData();
      },
    );

    return () => {
      cancelled = true;
      authListener?.subscription.unsubscribe();
    };
  }, [supabase, loadData]);

  const handleInitialize = async (yearToInit: number) => {
    setInitializing(true);
    try {
      const res = await fetch("/api/polls/initialize-calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year: yearToInit }),
      });
      if (!res.ok) throw new Error("Failed to initialize");
      toast.success(`Calendar for ${yearToInit} initialized!`);
      await loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error initializing calendar");
    } finally {
      setInitializing(false);
    }
  };

  const handleVote = async (optionId: string, response: RsvpResponse) => {
    if (!me || !pollsAggregated) {
      toast.error("You must be logged in to vote.");
      return;
    }
    const option = pollsAggregated.options.find(o => o.id === optionId);
    if (!option) return;
    const targetPollId = option.poll_id;
    
    // Optimistic update
    const previousRsvps = [...pollsAggregated.rsvps];
    const existingIndex = previousRsvps.findIndex((r) => r.user_id === me.id && r.poll_option_id === optionId);
    const newRsvps = [...previousRsvps];
    
    if (existingIndex >= 0 && newRsvps[existingIndex].response === response) {
      // Toggle off
      newRsvps.splice(existingIndex, 1);
    } else if (existingIndex >= 0) {
      // Change vote
      newRsvps[existingIndex] = { ...newRsvps[existingIndex], response };
    } else {
      // New vote
      newRsvps.push({
        id: `temp-${Date.now()}`,
        poll_id: targetPollId,
        poll_option_id: optionId,
        user_id: me.id,
        response,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }
    setPollsAggregated({ ...pollsAggregated, rsvps: newRsvps });

    try {
      if (existingIndex >= 0 && previousRsvps[existingIndex].response === response) {
        const { error } = await supabase.from("rsvps").delete().eq("id", previousRsvps[existingIndex].id);
        if (error) throw error;
      } else if (existingIndex >= 0) {
        const { error } = await supabase.from("rsvps").update({ response }).eq("id", previousRsvps[existingIndex].id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("rsvps").insert({
          poll_id: targetPollId,
          poll_option_id: optionId,
          user_id: me.id,
          response,
        });
        if (error) throw error;
      }
      
      // Re-fetch RSVPs
      const startYear = baseDate.getFullYear();
      const endMonth = new Date(baseDate);
      endMonth.setMonth(endMonth.getMonth() + 5);
      const requiredYears = Array.from(new Set([startYear, endMonth.getFullYear()]));
      const requiredIsos = requiredYears.map(y => `${y}-01-01`);
      
      const { data: pollsData } = await supabase.from("polls").select("id").in("weekend_start_date", requiredIsos);
      if (pollsData) {
         const pIds = pollsData.map(p => p.id);
         const { data: latestRsvps } = await supabase.from("rsvps").select("*").in("poll_id", pIds);
         if (latestRsvps) {
           setPollsAggregated((p) => p ? { ...p, rsvps: latestRsvps as Rsvp[] } : p);
         }
      }
    } catch (err) {
      toast.error("Failed to save vote");
      setPollsAggregated({ ...pollsAggregated, rsvps: previousRsvps }); // Revert
    }
  };

  const tallies = useMemo(() => pollsAggregated ? tallyPoll(pollsAggregated) : new Map<string, OptionTally>(), [pollsAggregated]);

  return (
    <motion.main
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex-1 md:overflow-auto bg-[radial-gradient(circle_at_top,_rgba(57,255,20,0.05)_0%,_rgba(14,17,23,1)_60%)] text-[#FAFAFA] px-4 md:px-6 xl:px-12 py-5"
    >
      <Link
        href="/games"
        className="inline-flex items-center gap-2 text-base text-white/50 hover:text-[#39FF14] font-semibold transition-colors mb-6"
      >
        <ChevronLeft size={18} />
        <span>Back to Games</span>
      </Link>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-[#39FF14]/10 rounded-xl border border-[#39FF14]/20">
            <CalendarIcon className="text-[#39FF14]" size={22} />
          </div>
          <div>
            <h1 className="text-2xl md:text-4xl font-black tracking-tight uppercase leading-none">
              Rolling Poll
            </h1>
            <p className="text-white/50 text-base mt-2">
              Plan and vote on upcoming games
            </p>
          </div>
        </div>
      </div>

      {missingYears.length > 0 && iAmAdmin && (
        <div className="mb-8 bg-yellow-500/10 border border-yellow-500/30 rounded-2xl p-5 shadow-[0_0_20px_rgba(234,179,8,0.1)] flex items-center justify-between flex-wrap gap-4">
          <div>
            <h3 className="text-yellow-400 font-bold tracking-widest uppercase mb-1 flex items-center gap-2">
              <ShieldAlert size={18} />
              Action Required
            </h3>
            <p className="text-yellow-400/70 text-sm font-semibold">
              The calendar for {missingYears.join(" and ")} has not been initialized yet.
            </p>
          </div>
          <div className="flex gap-2">
            {missingYears.map(y => (
              <button
                key={y}
                onClick={() => handleInitialize(y)}
                disabled={initializing}
                className="px-4 py-2 rounded-xl bg-yellow-500/20 hover:bg-yellow-500/30 border border-yellow-500/50 text-yellow-400 font-black uppercase text-xs tracking-widest transition-colors disabled:opacity-50"
              >
                {initializing ? "Wait..." : `Init ${y}`}
              </button>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-pulse">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-white/5 border border-white/10 rounded-2xl h-64" />
          ))}
        </div>
      ) : !pollsAggregated ? (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-12 text-center max-w-2xl mx-auto mt-12">
          <CalendarIcon className="text-white/20 mx-auto mb-4" size={48} />
          <h2 className="text-2xl font-black uppercase mb-2">No Calendar Data</h2>
          <p className="text-white/50 text-base mb-6">
            There are no initialized polls for this 6-month window.
          </p>
        </div>
      ) : (
        <>
          <TopSummaryBanner poll={pollsAggregated} tallies={tallies} users={users} />
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, idx) => {
              const mDate = new Date(baseDate);
              mDate.setMonth(mDate.getMonth() + idx);
              return (
                <MonthGrid
                  key={mDate.toISOString()}
                  year={mDate.getFullYear()}
                  month={mDate.getMonth()}
                  poll={pollsAggregated}
                  tallies={tallies}
                  users={users}
                  myUserId={me?.id}
                  onToggleVote={(optId) => handleVote(optId, "yes")}
                />
              );
            })}
          </div>
        </>
      )}
    </motion.main>
  );
}

// --- Top Summary Banner ---
function TopSummaryBanner({ poll, tallies, users }: { poll: PollWithDetails, tallies: Map<string, OptionTally>, users: UserMap }) {
  const leaderInfo = useMemo(() => {
    // We want the most votes out of the upcoming last weekend and first weekend of the month.
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const bounds = nextMonthlyBoundaryPair(today);
    
    // Collect all options that belong to these two boundary weekends
    const boundaryIsos = new Set<string>();
    
    // Last weekend dates
    const lwFriday = new Date(bounds.lastFriday);
    for (let i = 0; i < 3; i++) {
      const d = new Date(lwFriday);
      d.setDate(d.getDate() + i);
      boundaryIsos.add(toIsoDate(d));
    }
    // Also include Monday if it's a bank holiday (will be caught if it exists as an option)
    const lwMon = new Date(lwFriday); lwMon.setDate(lwMon.getDate() + 3);
    boundaryIsos.add(toIsoDate(lwMon));

    // First weekend dates
    const fwFriday = new Date(bounds.firstFridayNext);
    for (let i = 0; i < 3; i++) {
      const d = new Date(fwFriday);
      d.setDate(d.getDate() + i);
      boundaryIsos.add(toIsoDate(d));
    }
    const fwMon = new Date(fwFriday); fwMon.setDate(fwMon.getDate() + 3);
    boundaryIsos.add(toIsoDate(fwMon));

    // Filter viable options
    const viableOptions = poll.options.filter(o => 
      boundaryIsos.has(o.game_date) && o.game_date >= toIsoDate(today)
    );

    if (viableOptions.length === 0) return null;

    // Find the one with most votes
    const leader = [...viableOptions].sort((a, b) => {
      const ta = tallies.get(a.id);
      const tb = tallies.get(b.id);
      const yesA = ta?.yes ?? 0;
      const yesB = tb?.yes ?? 0;
      if (yesB !== yesA) return yesB - yesA;
      return a.game_date.localeCompare(b.game_date);
    })[0];

    const tally = tallies.get(leader.id);
    if (!tally || tally.yes === 0) return null; // No votes at all yet

    return { leader, tally };
  }, [poll, tallies]);

  if (!leaderInfo) return null;

  return (
    <div className="mb-8 bg-gradient-to-r from-[#39FF14]/10 to-transparent border border-[#39FF14]/30 rounded-2xl p-5 md:p-6 shadow-[0_0_30px_rgba(57,255,20,0.05)]">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Trophy className="text-[#39FF14]" size={18} />
            <span className="text-xs font-black tracking-widest uppercase text-[#39FF14]">
              Upcoming Weekend Leader
            </span>
          </div>
          <p className="text-2xl font-black uppercase tracking-tight text-white mb-1">
            {formatDateLong(leaderInfo.leader.game_date)}
          </p>
          <p className="text-sm font-semibold text-white/60">
            {leaderInfo.leader.label} · {leaderInfo.tally.yes} ({leaderInfo.tally.voters.yes.map(uid => users[uid]?.player_name || "Unknown").join(", ")})
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <Link
            href={`/games/poll?date=${leaderInfo.leader.game_date}`}
            className="inline-flex items-center justify-center px-5 py-2.5 rounded-xl bg-[#39FF14] text-black font-black uppercase text-sm tracking-widest hover:shadow-[0_0_20px_rgba(57,255,20,0.5)] transition-shadow"
          >
            RSVP
          </Link>
        </div>
      </div>
    </div>
  );
}

// --- Day Cell ---
function DayCell({ date, iso, option, tally, myVote, users, onToggleVote }: { date: Date, iso: string, option: PollOption | undefined, tally: OptionTally | null | undefined, myVote: string | null | undefined, users: UserMap, onToggleVote: (id: string) => void }) {
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const isLongPressRef = useRef(false);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!option) return;
    isLongPressRef.current = false;
    timerRef.current = setTimeout(() => {
      isLongPressRef.current = true;
      const yesUsers = tally?.voters.yes.map(uid => users[uid] || { player_name: "Unknown", avatar_url: null }) || [];
      
      toast.custom((t) => (
        <div className="bg-[#1a1f29] border border-[#39FF14]/30 rounded-2xl p-6 shadow-2xl text-white w-full min-w-[240px] max-w-[340px]">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <Users size={24} className="text-[#39FF14]" />
              <h4 className="font-black tracking-widest uppercase text-[#39FF14] text-2xl">Players</h4>
            </div>
          </div>
          <div className="flex flex-col gap-4 max-h-72 overflow-y-auto pr-2">
            {yesUsers.length > 0 ? (
              yesUsers.map((u, i) => (
                <div key={i} className="flex items-center gap-4">
                  {u.avatar_url ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={u.avatar_url} alt={u.player_name} className="w-12 h-12 rounded-full object-cover border border-white/10 bg-white/5 shadow-md" />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center border border-white/10 shadow-md">
                      <span className="text-lg font-black text-white/60">{u.player_name.charAt(0).toUpperCase()}</span>
                    </div>
                  )}
                  <span className="text-xl font-bold tracking-tight">{u.player_name}</span>
                </div>
              ))
            ) : (
              <span className="text-white/50 text-lg italic">No votes yet</span>
            )}
          </div>
        </div>
      ), { duration: 4000 });

      if (window.navigator && window.navigator.vibrate) {
        window.navigator.vibrate(50);
      }
    }, 500);
  };

  const handlePointerUp = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  };

  const handleClick = (e: React.MouseEvent) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (isLongPressRef.current) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (option) onToggleVote(option.id);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    if (option) e.preventDefault();
  };

  let btnClass = "aspect-square rounded-lg flex flex-col items-center justify-center relative transition-all border text-sm font-semibold ";
  
  if (option) {
    if (myVote === "yes") {
      if (option.is_bank_holiday) {
        btnClass += "border-yellow-400 bg-yellow-400 text-black hover:bg-yellow-500 shadow-[0_0_15px_rgba(234,179,8,0.4)] cursor-pointer";
      } else {
        btnClass += "border-[#39FF14] bg-[#39FF14] text-black hover:bg-[#32e612] shadow-[0_0_15px_rgba(57,255,20,0.4)] cursor-pointer";
      }
    } else {
      if (option.is_bank_holiday) {
        btnClass += "border-yellow-500/40 bg-yellow-500/10 text-yellow-400 hover:border-yellow-400 hover:shadow-[0_0_10px_rgba(234,179,8,0.3)] cursor-pointer";
      } else {
        btnClass += "border-[#39FF14]/30 bg-[#39FF14]/5 text-[#39FF14] hover:border-[#39FF14] hover:shadow-[0_0_10px_rgba(57,255,20,0.3)] cursor-pointer";
      }
    }
  } else {
    btnClass += "border-transparent text-white/30 cursor-default";
  }

  const isPast = date < new Date(new Date().setHours(0,0,0,0));
  if (isPast && option) {
    if (myVote === "yes") {
      btnClass = btnClass.replace("border-[#39FF14]", "border-white/20").replace("bg-[#39FF14]", "bg-white/20").replace("text-black", "text-white").replace("shadow-[0_0_15px_rgba(57,255,20,0.4)]", "");
      btnClass = btnClass.replace("border-yellow-400", "border-white/20").replace("bg-yellow-400", "bg-white/20").replace("text-black", "text-white").replace("shadow-[0_0_15px_rgba(234,179,8,0.4)]", "");
    } else {
      btnClass = btnClass.replace("border-[#39FF14]/30", "border-white/10").replace("bg-[#39FF14]/5", "bg-black/20").replace("text-[#39FF14]", "text-white/40");
      btnClass = btnClass.replace("border-yellow-500/40", "border-white/10").replace("bg-yellow-500/10", "bg-black/20").replace("text-yellow-400", "text-white/40");
    }
  }

  const yesVoters = tally?.voters.yes.map(uid => users[uid]?.player_name || "Unknown").join(", ") || "";
  let tooltip = "";
  if (option) {
    tooltip = `${option.label}`;
    if (yesVoters) tooltip += `\nYes: ${yesVoters}`;
    else tooltip += `\nNo votes yet`;
  }

  return (
    <button
      className={btnClass + " select-none touch-manipulation"}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      disabled={!option}
      title={tooltip}
      style={{ WebkitTouchCallout: "none" }}
    >
      <span>{date.getDate()}</span>
      {tally && tally.yes > 0 && myVote !== "yes" && (
        <div className="absolute bottom-1 w-full flex justify-center gap-0.5">
          <span className={`text-[10px] leading-none font-bold ${option?.is_bank_holiday ? 'text-yellow-400' : 'text-[#39FF14]'}`}>
            {tally.yes}
          </span>
        </div>
      )}
      {tally && tally.yes > 0 && myVote === "yes" && (
        <div className="absolute bottom-1 w-full flex justify-center gap-0.5">
          <span className="text-[10px] leading-none font-bold text-black/60">
            {tally.yes}
          </span>
        </div>
      )}
    </button>
  );
}

// --- Month Grid ---
function MonthGrid({ year, month, poll, tallies, users, myUserId, onToggleVote }: { year: number, month: number, poll: PollWithDetails, tallies: Map<string, OptionTally>, users: UserMap, myUserId?: string, onToggleVote: (optionId: string) => void }) {
  const monthName = new Date(year, month, 1).toLocaleDateString("en-GB", { month: "long" });
  
  // Build calendar days
  const days = useMemo(() => {
    const start = new Date(year, month, 1);
    const end = new Date(year, month + 1, 0);
    
    // Pad start (0=Sun, 1=Mon)
    let startOffset = start.getDay() - 1;
    if (startOffset === -1) startOffset = 6; // Sunday is 6th index in Mon-first week
    
    const paddedDays: (Date | null)[] = Array(startOffset).fill(null);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      paddedDays.push(new Date(d));
    }
    return paddedDays;
  }, [year, month]);

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
      <h3 className="text-lg font-black uppercase tracking-widest text-[#39FF14] mb-4 text-center">{monthName}</h3>
      <div className="grid grid-cols-7 gap-1 text-center mb-2">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <div key={i} className="text-[10px] font-bold text-white/30 uppercase">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((date, i) => {
          if (!date) return <div key={`empty-${i}`} className="aspect-square" />;
          
          const iso = toIsoDate(date);
          const option = poll.options.find(o => o.game_date === iso);
          const tally = option ? tallies.get(option.id) : null;
          const myVote = (myUserId && option) ? poll.rsvps.find(r => r.poll_option_id === option.id && r.user_id === myUserId)?.response : null;
          return (
            <DayCell
              key={iso}
              date={date}
              iso={iso}
              option={option}
              tally={tally}
              myVote={myVote}
              users={users}
              onToggleVote={onToggleVote}
            />
          );
        })}
      </div>
    </div>
  );
}

// --- Utils ---
function formatDateLong(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

function toIsoDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
