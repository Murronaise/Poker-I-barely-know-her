"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, Calendar, Save, Sparkles, RefreshCw, AlertTriangle, ChevronDown } from "lucide-react";
import { motion } from "framer-motion";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  fridayOf, weekendDays, DEFAULT_MIN_PLAYERS,
  upcomingFirstAndLastWeekends, isFirstOrLastWeekend,
} from "@/lib/polls";

type DayOption = {
  key: "friday" | "saturday" | "sunday";
  label: string;
  date: Date;
  defaultEnabled: boolean;
  isBankHoliday: boolean;
  bankHolidayName: string | null;
};

const DEFAULT_START_TIME = "19:30";

export default function NewPollPage() {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const searchParams = useSearchParams();

  // If the create page was opened from "Force re-poll", we land here with
  // ?weekend=YYYY-MM-DD&parent=<uuid> so the new poll links back to the old
  // one and starts targeting the same weekend.
  const weekendQuery = searchParams.get("weekend");
  const parentPollId = searchParams.get("parent");

  // We only play the first or last weekend of each month, so the picker is
  // a list of upcoming first/last weekends rather than a free-form date.
  // Admin can still drop into a custom date via the "Other date" toggle —
  // useful if a one-off weekend is needed.
  const presetSlots = useMemo(() => upcomingFirstAndLastWeekends(new Date(), 6), []);

  // If the page was opened from a re-poll for a specific weekend, lock to
  // that. Otherwise default to the next first/last weekend.
  const initialFriday = useMemo(() => {
    if (weekendQuery) return new Date(weekendQuery + "T00:00:00");
    return presetSlots[0]?.friday ?? fridayOf(new Date());
  }, [weekendQuery, presetSlots]);
  const [weekendStart, setWeekendStart] = useState<string>(toIsoDate(initialFriday));
  const [showCustomDate, setShowCustomDate] = useState(
    Boolean(weekendQuery) && !isFirstOrLastWeekend(new Date(weekendQuery + "T00:00:00")),
  );

  const [options, setOptions] = useState<DayOption[]>([]);
  const [startTime, setStartTime] = useState(DEFAULT_START_TIME);
  const [minPlayers, setMinPlayers] = useState(DEFAULT_MIN_PLAYERS);
  const [notes, setNotes] = useState("");
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [bhLoading, setBhLoading] = useState(true);

  // When the weekend changes, recompute the three day options + ask the
  // server-side bank-holiday util whether Sunday is playable. We hit our
  // own /api endpoint so the gov.uk feed call stays server-side.
  useEffect(() => {
    let cancelled = false;
    const computeDays = async () => {
      setBhLoading(true);
      const friday = new Date(weekendStart + "T00:00:00");
      const days = weekendDays(friday);

      // Fetch bank-holiday status for the Sunday in one shot.
      let sundayPlayable = false;
      let sundayHolidayName: string | null = null;
      try {
        const res = await fetch(`/api/bank-holidays/sunday-playable?date=${toIsoDate(days.sunday)}`);
        if (res.ok) {
          const data = await res.json();
          sundayPlayable = data.playable;
          sundayHolidayName = data.holidayName;
        }
      } catch {
        // Network error — leave Sunday opt-out, admin can still toggle it on.
      }

      if (cancelled) return;

      const newOptions: DayOption[] = [
        {
          key: "friday",
          label: "Friday",
          date: days.friday,
          defaultEnabled: true,
          isBankHoliday: false,
          bankHolidayName: null,
        },
        {
          key: "saturday",
          label: "Saturday",
          date: days.saturday,
          defaultEnabled: true,
          isBankHoliday: false,
          bankHolidayName: null,
        },
        {
          key: "sunday",
          label: sundayHolidayName ? `Bank Holiday Sunday (${sundayHolidayName})` : "Sunday",
          date: days.sunday,
          defaultEnabled: sundayPlayable,
          isBankHoliday: sundayPlayable,
          bankHolidayName: sundayHolidayName,
        },
      ];

      setOptions(newOptions);
      // Reset enabled state to the new defaults whenever the weekend shifts.
      setEnabled({
        friday: true,
        saturday: true,
        sunday: sundayPlayable,
      });
      setBhLoading(false);
    };
    computeDays();
    return () => { cancelled = true; };
  }, [weekendStart]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const selected = options.filter((o) => enabled[o.key]);
    if (selected.length === 0) {
      setError("Pick at least one day for the group to vote on.");
      return;
    }

    setLoading(true);
    try {
      const { data: userResp } = await supabase.auth.getUser();
      const userId = userResp.user?.id;
      if (!userId) {
        setError("You need to be logged in.");
        setLoading(false);
        return;
      }

      // 1. Insert the poll row.
      const { data: poll, error: pollError } = await supabase
        .from("polls")
        .insert({
          created_by: userId,
          weekend_start_date: weekendStart,
          status: "open",
          min_players: minPlayers,
          notes: notes.trim() || null,
          parent_poll_id: parentPollId || null,
        })
        .select()
        .single();

      if (pollError || !poll) {
        setError(pollError?.message || "Failed to create poll.");
        setLoading(false);
        return;
      }

      // 2. Insert the chosen options.
      const optionRows = selected.map((o) => ({
        poll_id: poll.id,
        game_date: toIsoDate(o.date),
        start_time: startTime,
        label: o.label,
        is_bank_holiday: o.isBankHoliday,
      }));

      const { error: optsError } = await supabase
        .from("poll_options")
        .insert(optionRows);

      if (optsError) {
        // Roll back the poll so we don't leave a half-built one.
        await supabase.from("polls").delete().eq("id", poll.id);
        setError(optsError.message || "Failed to create poll options.");
        setLoading(false);
        return;
      }

      router.push(`/games/poll/${poll.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setLoading(false);
    }
  };

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

      <div className="max-w-2xl">
        <div className="flex items-center gap-3 mb-8">
          <div className="p-2.5 bg-[#39FF14]/10 rounded-xl border border-[#39FF14]/20">
            {parentPollId ? (
              <RefreshCw className="text-[#39FF14]" size={22} />
            ) : (
              <Sparkles className="text-[#39FF14]" size={22} />
            )}
          </div>
          <div>
            <h1 className="text-2xl md:text-4xl font-black tracking-tight uppercase leading-none">
              {parentPollId ? "Re-poll" : "New Poll"}
            </h1>
            <p className="text-white/50 text-base mt-2">
              {parentPollId
                ? "Numbers dropped — let the group pick a new day"
                : "Pick the candidate days; the group RSVPs Yes/Maybe/No"}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6" noValidate>
          {/* Weekend picker — first/last of the month chips */}
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
            <label className="block text-xs font-bold text-white/50 uppercase mb-3 tracking-widest">
              Weekend
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {presetSlots.map((slot) => {
                const iso = toIsoDate(slot.friday);
                const selected = iso === weekendStart;
                return (
                  <button
                    key={iso}
                    type="button"
                    onClick={() => { setWeekendStart(iso); setShowCustomDate(false); }}
                    className={`text-left p-3 rounded-lg border transition-colors ${
                      selected
                        ? "bg-[#39FF14]/15 border-[#39FF14]/50"
                        : "bg-black/30 border-white/10 hover:border-white/20"
                    }`}
                  >
                    <p className="text-[10px] font-black tracking-widest uppercase text-white/40">
                      {slot.position === "first" ? "First weekend" : "Last weekend"}
                    </p>
                    <p className="text-base font-bold text-white">
                      {slot.friday.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
                    </p>
                    <p className="text-xs text-white/40">{slot.monthLabel}</p>
                  </button>
                );
              })}
            </div>

            {/* Custom date escape hatch — collapsed by default. */}
            <button
              type="button"
              onClick={() => setShowCustomDate((v) => !v)}
              className="mt-4 inline-flex items-center gap-1 text-xs font-bold tracking-widest uppercase text-white/40 hover:text-white/70 transition-colors"
            >
              <ChevronDown size={12} className={`transition-transform ${showCustomDate ? "rotate-180" : ""}`} />
              Other date
            </button>

            {showCustomDate && (
              <div className="mt-3">
                <input
                  type="date"
                  value={weekendStart}
                  onChange={(e) => {
                    if (!e.target.value) return;
                    const picked = new Date(e.target.value + "T00:00:00");
                    setWeekendStart(toIsoDate(fridayOf(picked)));
                  }}
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[#39FF14] focus:ring-1 focus:ring-[#39FF14]/50 transition-colors"
                />
                <p className="text-xs text-white/30 mt-2">
                  Picks snap to the Friday of that calendar weekend.
                </p>
                {!isFirstOrLastWeekend(new Date(weekendStart + "T00:00:00")) && (
                  <p className="mt-2 text-xs text-yellow-400/90 flex items-start gap-1.5">
                    <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                    Heads up: this isn&apos;t the first or last weekend of the month — the group normally only plays on those.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Day options */}
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
            <h2 className="text-lg font-black uppercase mb-4 flex items-center gap-2">
              <Calendar size={18} className="text-[#39FF14]" />
              Candidate Days
            </h2>

            {bhLoading ? (
              <div className="space-y-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-16 bg-white/5 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {options.map((opt) => {
                  const checked = enabled[opt.key] ?? opt.defaultEnabled;
                  return (
                    <label
                      key={opt.key}
                      className={`flex items-center gap-4 p-4 rounded-lg border cursor-pointer transition-colors ${
                        checked
                          ? "bg-[#39FF14]/10 border-[#39FF14]/40"
                          : "bg-black/30 border-white/10 hover:border-white/20"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => setEnabled({ ...enabled, [opt.key]: e.target.checked })}
                        className="w-5 h-5 rounded border-white/20 bg-black/40 accent-[#39FF14] cursor-pointer"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-base text-white truncate">
                          {opt.label}
                        </p>
                        <p className="text-xs text-white/50">
                          {opt.date.toLocaleDateString("en-GB", {
                            weekday: "long", day: "numeric", month: "long", year: "numeric",
                          })}
                        </p>
                      </div>
                      {opt.isBankHoliday && (
                        <span className="text-xs font-bold text-yellow-400 uppercase tracking-widest shrink-0">
                          Bank holiday
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {/* Settings */}
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
            <h2 className="text-lg font-black uppercase mb-4">Settings</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-white/50 uppercase mb-2 tracking-widest">
                  Start Time
                </label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[#39FF14] focus:ring-1 focus:ring-[#39FF14]/50"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-white/50 uppercase mb-2 tracking-widest">
                  Minimum Players
                </label>
                <input
                  type="number"
                  min={2}
                  max={20}
                  value={minPlayers}
                  onChange={(e) => setMinPlayers(parseInt(e.target.value, 10) || DEFAULT_MIN_PLAYERS)}
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[#39FF14] focus:ring-1 focus:ring-[#39FF14]/50"
                />
                <p className="text-xs text-white/30 mt-2">
                  If yeses drop below this, you can force a re-poll.
                </p>
              </div>
            </div>

            <div className="mt-4">
              <label className="block text-xs font-bold text-white/50 uppercase mb-2 tracking-widest">
                Notes (optional)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Venue, blinds, anything the group should know"
                className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[#39FF14] focus:ring-1 focus:ring-[#39FF14]/50 resize-none"
              />
            </div>
          </div>

          {error && (
            <div role="alert" aria-live="polite" className="bg-red-400/10 border border-red-400/30 rounded-lg px-4 py-3">
              <p className="text-sm font-semibold text-red-400">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || bhLoading}
            className="w-full bg-[#39FF14]/20 hover:bg-[#39FF14]/30 border border-[#39FF14]/50 text-[#39FF14] font-black uppercase text-sm py-3 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <Save size={16} />
            {loading ? "Creating..." : "Create Poll"}
          </button>
        </form>
      </div>
    </motion.main>
  );
}

function toIsoDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
