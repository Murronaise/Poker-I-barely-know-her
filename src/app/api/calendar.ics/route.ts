// iCal feed of confirmed games. Subscribing friends drop the URL into
// their phone calendar; the next time their device syncs they see every
// upcoming session.
//
// The feed is publicly readable — by design — so anyone with the URL can
// subscribe. The trade-off: it's not a secret-bearing URL. We could add a
// per-user token later; for a small home game it's fine.
//
// "Confirmed" means a poll with status='confirmed' AND a
// confirmed_option_id. Historical (already-played) games are also folded
// in so users can scroll back through their own calendar to see when
// past sessions happened.

import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { historicalGames } from "@/lib/historical-games";
import { DEFAULT_VENUE } from "@/lib/local-store";

export const dynamic = "force-dynamic";

const CRLF = "\r\n";

/** RFC 5545 line folding — long lines must wrap at 75 octets. */
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const out: string[] = [];
  let remaining = line;
  while (remaining.length > 75) {
    out.push(remaining.slice(0, 75));
    remaining = " " + remaining.slice(75);
  }
  out.push(remaining);
  return out.join(CRLF);
}

function icsEscape(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * Emit "floating" local-time DTSTART (no `Z` suffix, no TZID). Every
 * RFC-5545 client interprets this as wall-clock time in the user's
 * local timezone — which is exactly what the user typed when they
 * set up the poll. The previous UTC conversion relied on the cron
 * server's timezone, which on Vercel is UTC, so a "19:30" entry
 * ended up appearing 1h late in the UK during BST.
 */
function toIcsLocalDateTime(date: string, time: string): string {
  const [hh, mm, ss = "0"] = time.split(":");
  const safeHh = hh.padStart(2, "0");
  const safeMm = mm.padStart(2, "0");
  const safeSs = ss.padStart(2, "0");
  // YYYYMMDDTHHMMSS — no Z, no TZID. Floating local time.
  return `${date.replaceAll("-", "")}T${safeHh}${safeMm}${safeSs}`;
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

/** Convert "Mon DD, YYYY" → an all-day DTSTART in UTC date form. Used for
 *  historical games where we only know the day, not the time. */
function dateOnlyToIcs(humanDate: string): string | null {
  const d = new Date(humanDate);
  if (!Number.isFinite(d.getTime())) return null;
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

export async function GET(): Promise<NextResponse> {
  const sb = await createSupabaseServerClient();

  // Confirmed upcoming + recent polls. We pull the joined option for the
  // start time + label.
  const { data: polls } = await sb
    .from("polls")
    .select("id, status, confirmed_option_id, notes, weekend_start_date")
    .eq("status", "confirmed");

  const optionIds = (polls ?? [])
    .map((p: { confirmed_option_id: string | null }) => p.confirmed_option_id)
    .filter((id: string | null): id is string => Boolean(id));

  const optionsById = new Map<
    string,
    { id: string; poll_id: string; game_date: string; start_time: string; label: string }
  >();
  if (optionIds.length > 0) {
    const { data: opts } = await sb
      .from("poll_options")
      .select("id, poll_id, game_date, start_time, label")
      .in("id", optionIds);
    (opts ?? []).forEach((o: {
      id: string;
      poll_id: string;
      game_date: string;
      start_time: string;
      label: string;
    }) => {
      optionsById.set(o.id, o);
    });
  }

  const now = new Date();
  const dtstamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Poker Tracker//Calendar Feed//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Poker nights",
    "X-WR-TIMEZONE:Europe/London",
  ];

  // Future / confirmed games.
  for (const poll of polls ?? []) {
    if (!poll.confirmed_option_id) continue;
    const opt = optionsById.get(poll.confirmed_option_id);
    if (!opt) continue;
    // Floating local DTSTART — see toIcsLocalDateTime comment for why.
    const dtstart = toIcsLocalDateTime(opt.game_date, opt.start_time);
    // Default 4-hour block — actual duration emerges once the game is logged.
    // Add 4h to the same floating time without going through Date.UTC, so
    // a BST start of 19:30 stays a BST end of 23:30 in the user's calendar.
    const [hh, mm] = opt.start_time.split(":").map((n) => parseInt(n, 10));
    const endHour = (hh + 4) % 24;
    const dayCarry = Math.floor((hh + 4) / 24);
    const endDateParts = opt.game_date.split("-").map((n) => parseInt(n, 10));
    // Walk the date forward by `dayCarry` days when the end time crosses midnight.
    const endJsDate = new Date(Date.UTC(endDateParts[0], endDateParts[1] - 1, endDateParts[2] + dayCarry));
    const dtend = toIcsLocalDateTime(
      `${endJsDate.getUTCFullYear()}-${pad(endJsDate.getUTCMonth() + 1)}-${pad(endJsDate.getUTCDate())}`,
      `${pad(endHour)}:${pad(mm)}:00`,
    );

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:poker-poll-${poll.id}@poker-tracker`);
    lines.push(`DTSTAMP:${dtstamp}`);
    lines.push(`DTSTART:${dtstart}`);
    lines.push(`DTEND:${dtend}`);
    lines.push(foldLine(`SUMMARY:${icsEscape(opt.label || "Poker night")}`));
    lines.push(foldLine(`LOCATION:${icsEscape(DEFAULT_VENUE)}`));
    if (poll.notes) lines.push(foldLine(`DESCRIPTION:${icsEscape(poll.notes)}`));
    lines.push("END:VEVENT");
  }

  // Historical (already-played) sessions — emitted as all-day events so the
  // calendar shows what happened without claiming a specific time.
  for (const g of historicalGames) {
    const start = dateOnlyToIcs(g.date);
    if (!start) continue;
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:poker-historical-${g.id}@poker-tracker`);
    lines.push(`DTSTAMP:${dtstamp}`);
    lines.push(`DTSTART;VALUE=DATE:${start}`);
    lines.push(foldLine(`SUMMARY:${icsEscape(`Poker — ${g.players.length} players · £${g.totalPot}`)}`));
    lines.push(foldLine(`LOCATION:${icsEscape(g.location)}`));
    lines.push(foldLine(`DESCRIPTION:${icsEscape(`Duration ${g.duration} · Blinds ${g.blinds}`)}`));
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");

  return new NextResponse(lines.join(CRLF) + CRLF, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=300",
      "Content-Disposition": 'inline; filename="poker.ics"',
    },
  });
}
