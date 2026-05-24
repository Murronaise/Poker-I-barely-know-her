// Daily poll-housekeeping cron — verdict pass only.
//
// What it does:
//   For each open poll, pick the leading option among its still-future
//   game dates (suggestWinner: most yes, then most maybe, then earliest).
//   Decide based on the leader's distance from today:
//     - leader.game_date <= today+7 AND yes >= min_players → CONFIRM that
//       option (lock in, RSVP stays open on the confirmed date only).
//     - latest viable option.game_date <= today+7 AND no option has hit
//       quorum → CANCEL the poll.
//     - otherwise → leave open; wait for more votes.
//   This is per-option dynamic so a single poll spanning two weekends
//   can lock the early or late option independently as the calendar
//   approaches each.
//
// What it no longer does:
//   Auto-create polls. That has moved to the game-end trigger
//   (/api/polls/create-monthly), which fires the next monthly boundary
//   pair once a live game is wrapped up.
//
// Trigger: configure Vercel Cron (or any external scheduler) to POST this
// endpoint daily. We accept GET too so curl-driven testing is trivial.
//
// Auth: the endpoint expects a shared secret in either the `Authorization`
// header (`Bearer <token>`) or the `?token=<token>` query param. The
// secret is read from `CRON_SECRET` env var. Missing secret OR mismatched
// token = 401. Skip this gating only in development — never in prod.

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import {
  DEFAULT_MIN_PLAYERS,
  tallyPoll,
  type PollWithDetails,
  type PollOption,
} from "@/lib/polls";

export const dynamic = "force-dynamic";

function requireCronAuth(req: NextRequest): NextResponse | null {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET not configured on the server" },
      { status: 500 },
    );
  }
  const header = req.headers.get("authorization") ?? "";
  const bearer = header.toLowerCase().startsWith("bearer ")
    ? header.slice(7).trim()
    : null;
  const query = req.nextUrl.searchParams.get("token");
  const provided = bearer ?? query;
  if (!provided || provided !== expected) {
    return NextResponse.json({ ok: false, error: "unauthorised" }, { status: 401 });
  }
  return null;
}

async function runHousekeeping() {
  // The service client bypasses RLS — required because cron runs anonymous
  // server-side and the writes (poll status) are admin-gated.
  const sb = createSupabaseServiceClient();

  const summary = {
    cancelled: [] as string[],
    confirmed: [] as string[],
    errors: [] as string[],
  };

  const now = new Date();
  const todayIso = now.toISOString().split("T")[0];
  const verdictCutoffIso = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];

  // Pull every open poll whose earliest Friday is within reach. Polls
  // whose earliest option is still > 7 days out aren't actionable today.
  const { data: candidates, error: candidatesErr } = await sb
    .from("polls")
    .select(
      // Disambiguate the embed — there are two FKs between polls and
      // poll_options (poll_options.poll_id and polls.confirmed_option_id).
      "id, created_by, created_at, updated_at, weekend_start_date, status, confirmed_option_id, min_players, parent_poll_id, notes, options:poll_options!poll_options_poll_id_fkey(*), rsvps(*)",
    )
    .eq("status", "open")
    .lte("weekend_start_date", verdictCutoffIso);
  if (candidatesErr) {
    summary.errors.push(`verdict candidates fetch: ${candidatesErr.message}`);
  }

  for (const poll of (candidates ?? []) as unknown as PollWithDetails[]) {
    // Empty scaffold polls (created but never populated) get skipped —
    // they're not "rejected by quorum", they're just unfinished.
    if (poll.options.length === 0) continue;

    const threshold = poll.min_players ?? DEFAULT_MIN_PLAYERS;

    // Only consider options whose game_date hasn't already passed.
    const viable = poll.options.filter((o) => o.game_date >= todayIso);
    if (viable.length === 0) {
      // Every option is in the past — cancel so it stops cluttering the
      // open list.
      const { error: cancelErr } = await sb
        .from("polls")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("id", poll.id);
      if (cancelErr) {
        summary.errors.push(`cancel-stale ${poll.id}: ${cancelErr.message}`);
        continue;
      }
      summary.cancelled.push(poll.id);
      continue;
    }

    // Tally yes/maybe per option, then pick the leader among viable
    // options only.
    const tallies = tallyPoll(poll);
    const leader: PollOption = [...viable].sort((a, b) => {
      const ta = tallies.get(a.id)!;
      const tb = tallies.get(b.id)!;
      if (tb.yes !== ta.yes) return tb.yes - ta.yes;
      if (tb.maybe !== ta.maybe) return tb.maybe - ta.maybe;
      return a.game_date.localeCompare(b.game_date);
    })[0];
    const leaderYes = tallies.get(leader.id)?.yes ?? 0;

    // Is the leader actually inside the 7-day verdict window?
    const leaderInWindow = leader.game_date <= verdictCutoffIso;
    // Is EVERY remaining option inside the window? If so, time's up.
    const latestViableDate = viable
      .map((o) => o.game_date)
      .sort()
      .at(-1)!;
    const windowExpired = latestViableDate <= verdictCutoffIso;

    if (leaderInWindow && leaderYes >= threshold) {
      const { error: confirmErr } = await sb
        .from("polls")
        .update({
          status: "confirmed",
          confirmed_option_id: leader.id,
          updated_at: new Date().toISOString(),
        })
        .eq("id", poll.id);
      if (confirmErr) {
        summary.errors.push(`confirm ${poll.id}: ${confirmErr.message}`);
        continue;
      }
      summary.confirmed.push(poll.id);
    } else if (windowExpired) {
      // No remaining option can still gather more votes — cancel.
      const { error: cancelErr } = await sb
        .from("polls")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("id", poll.id);
      if (cancelErr) {
        summary.errors.push(`cancel ${poll.id}: ${cancelErr.message}`);
        continue;
      }
      summary.cancelled.push(poll.id);
    }
    // else: there's still a later option outside the verdict window —
    // wait, votes might still come in for it.
  }

  return summary;
}

export async function GET(req: NextRequest) {
  const auth = requireCronAuth(req);
  if (auth) return auth;
  const summary = await runHousekeeping();
  return NextResponse.json({ ok: true, summary });
}

export async function POST(req: NextRequest) {
  const auth = requireCronAuth(req);
  if (auth) return auth;
  const summary = await runHousekeeping();
  return NextResponse.json({ ok: true, summary });
}
