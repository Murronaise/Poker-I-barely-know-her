// Shared types + helpers for the poll system. Pure data/logic — no React,
// no Supabase imports here so it can be used from server and client alike.

export type PollStatus = "open" | "confirmed" | "cancelled" | "superseded";
export type RsvpResponse = "yes" | "maybe" | "no";

export type PollOption = {
  id: string;
  poll_id: string;
  game_date: string;       // YYYY-MM-DD
  start_time: string;      // HH:MM:SS
  label: string;
  is_bank_holiday: boolean;
};

export type Rsvp = {
  id: string;
  poll_id: string;
  poll_option_id: string;
  user_id: string;
  response: RsvpResponse;
  created_at: string;
  updated_at: string;
};

export type Poll = {
  id: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  weekend_start_date: string; // YYYY-MM-DD (the Friday)
  status: PollStatus;
  confirmed_option_id: string | null;
  min_players: number;
  parent_poll_id: string | null;
  notes: string | null;
};

export type PollWithDetails = Poll & {
  options: PollOption[];
  rsvps: Rsvp[];
};

/** Per-option tallies used in the UI. */
export type OptionTally = {
  optionId: string;
  yes: number;
  maybe: number;
  no: number;
  voters: { yes: string[]; maybe: string[]; no: string[] }; // user_ids
};

export function tallyPoll(poll: PollWithDetails): Map<string, OptionTally> {
  const out = new Map<string, OptionTally>();
  for (const opt of poll.options) {
    out.set(opt.id, {
      optionId: opt.id,
      yes: 0, maybe: 0, no: 0,
      voters: { yes: [], maybe: [], no: [] },
    });
  }
  for (const r of poll.rsvps) {
    const t = out.get(r.poll_option_id);
    if (!t) continue;
    t[r.response]++;
    t.voters[r.response].push(r.user_id);
  }
  return out;
}

/** Suggested winner = option with most yes votes; ties broken by maybe count. */
export function suggestWinner(poll: PollWithDetails): PollOption | null {
  if (poll.options.length === 0) return null;
  const tallies = tallyPoll(poll);
  return [...poll.options].sort((a, b) => {
    const ta = tallies.get(a.id)!;
    const tb = tallies.get(b.id)!;
    if (tb.yes !== ta.yes) return tb.yes - ta.yes;
    if (tb.maybe !== ta.maybe) return tb.maybe - ta.maybe;
    return a.game_date.localeCompare(b.game_date);
  })[0];
}

/**
 * Given any date, return the Friday of that calendar weekend (Fri-Sun).
 * If the input is already Fri/Sat/Sun, we walk back to the Friday.
 * If it's Mon-Thu, we walk forward to the upcoming Friday.
 */
export function fridayOf(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay(); // 0=Sun, 5=Fri, 6=Sat
  let delta = 0;
  if (dow === 0) delta = -2;        // Sun → back to Fri
  else if (dow === 6) delta = -1;   // Sat → back to Fri
  else if (dow === 5) delta = 0;    // Fri → today
  else delta = 5 - dow;             // Mon-Thu → forward to Fri
  d.setDate(d.getDate() + delta);
  return d;
}

/** Day-by-day list (Fri/Sat/Sun) for the weekend that contains the given date. */
export function weekendDays(weekendFriday: Date): { friday: Date; saturday: Date; sunday: Date } {
  const friday = new Date(weekendFriday);
  friday.setHours(0, 0, 0, 0);
  const saturday = new Date(friday);
  saturday.setDate(saturday.getDate() + 1);
  const sunday = new Date(friday);
  sunday.setDate(sunday.getDate() + 2);
  return { friday, saturday, sunday };
}

/** Default minimum players for a viable game. */
export const DEFAULT_MIN_PLAYERS = 4;

// ---- "First / last weekend of the month" helpers ---------------------------
// Group rule: we only play the first or last weekend of any month, so the
// poll-create UI should steer the admin toward those. A "weekend" is keyed
// off its Friday (matching `weekend_start_date` everywhere else).

/** Returns the date of the first Friday of `year`/`monthIdx` (0-based month). */
export function firstFridayOfMonth(year: number, monthIdx: number): Date {
  const d = new Date(year, monthIdx, 1);
  // 0=Sun, 5=Fri. (5 - dow + 7) % 7 = days to next Friday (0 if already Fri).
  const offset = (5 - d.getDay() + 7) % 7;
  d.setDate(1 + offset);
  return d;
}

/** Returns the date of the last Friday of `year`/`monthIdx` (0-based month). */
export function lastFridayOfMonth(year: number, monthIdx: number): Date {
  // Step back from the last day of the month to the most recent Friday.
  const lastDay = new Date(year, monthIdx + 1, 0);
  const offset = (lastDay.getDay() - 5 + 7) % 7;
  lastDay.setDate(lastDay.getDate() - offset);
  return lastDay;
}

export type WeekendSlot = {
  /** The Friday of this weekend. */
  friday: Date;
  /** "first" or "last" within its month. */
  position: "first" | "last";
  /** e.g. "March 2026" — the month the Friday falls in. */
  monthLabel: string;
};

/**
 * Generate the next `count` first/last weekends starting from `from`. The list
 * is sorted by date and de-duplicated (some months a single Friday is BOTH
 * the first and last; we keep one entry).
 */
export function upcomingFirstAndLastWeekends(
  from: Date = new Date(),
  count = 6,
): WeekendSlot[] {
  const start = new Date(from);
  start.setHours(0, 0, 0, 0);

  const slots: WeekendSlot[] = [];
  // Walk month by month — the loop bound is generous so we always fill `count`.
  for (let i = 0; slots.length < count && i < count + 4; i++) {
    const probe = new Date(start.getFullYear(), start.getMonth() + i, 1);
    const year = probe.getFullYear();
    const monthIdx = probe.getMonth();
    const monthLabel = probe.toLocaleDateString("en-GB", { month: "long", year: "numeric" });

    const first = firstFridayOfMonth(year, monthIdx);
    const last = lastFridayOfMonth(year, monthIdx);

    if (first >= start) {
      slots.push({ friday: first, position: "first", monthLabel });
    }
    // Skip duplicate when the month only contains one Friday slot.
    if (last >= start && last.getTime() !== first.getTime()) {
      slots.push({ friday: last, position: "last", monthLabel });
    }
  }

  return slots
    .sort((a, b) => a.friday.getTime() - b.friday.getTime())
    .slice(0, count);
}

/** Is `friday` the first OR last Friday of its month? */
export function isFirstOrLastWeekend(friday: Date): boolean {
  const year = friday.getFullYear();
  const month = friday.getMonth();
  const first = firstFridayOfMonth(year, month);
  const last = lastFridayOfMonth(year, month);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  return sameDay(friday, first) || sameDay(friday, last);
}
