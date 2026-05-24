// Daily poll-housekeeping cron.
//
// What it does:
//   1. At T-7 days from game day, decides each open poll in a single pass:
//      - Pick the option with the most yes votes (ties: most maybes, then
//        earliest date — see suggestWinner).
//      - If that option has >= min_players yes votes, mark the poll
//        `confirmed` and lock the winning option in.
//      - Otherwise mark the poll `cancelled`.
//      The window is "weekend_start_date <= today+7" so polls added late
//      (e.g. 4 days out) still get a verdict on the next cron run.
//   2. (Optional) Auto-creates a poll for the next first-or-last weekend
//      of the month when one doesn't already exist — gives the
//      "recurring weekly slot" feature with no per-week clicks.
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
  suggestWinner,
  upcomingFirstAndLastWeekends,
  type PollWithDetails,
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
  // server-side and the writes (poll status, poll inserts) are admin-gated.
  const sb = createSupabaseServiceClient();

  const summary = {
    cancelled: [] as string[],
    confirmed: [] as string[],
    created: [] as string[],
    errors: [] as string[],
  };

  // 1. T-7 verdict pass: confirm if the winning option has min_players yes
  //    votes, otherwise cancel. Catches anything inside the 7-day window so
  //    polls created late still get a verdict on the next cron run.
  const now = new Date();
  const verdictCutoffIso = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];

  const { data: candidates, error: candidatesErr } = await sb
    .from("polls")
    .select(
      "id, created_by, created_at, updated_at, weekend_start_date, status, confirmed_option_id, min_players, parent_poll_id, notes, options:poll_options(*), rsvps(*)",
    )
    .eq("status", "open")
    .lte("weekend_start_date", verdictCutoffIso);
  if (candidatesErr) {
    summary.errors.push(`verdict candidates fetch: ${candidatesErr.message}`);
  }

  for (const poll of (candidates ?? []) as unknown as PollWithDetails[]) {
    // Empty scaffold polls (auto-created but never populated with dates) get
    // skipped — they're not "rejected by quorum", they're just unfinished.
    if (poll.options.length === 0) continue;
    const threshold = poll.min_players ?? DEFAULT_MIN_PLAYERS;
    const winner = suggestWinner(poll);
    const yesForWinner = winner
      ? poll.rsvps.filter(
          (r) => r.poll_option_id === winner.id && r.response === "yes",
        ).length
      : 0;

    if (winner && yesForWinner >= threshold) {
      const { error: confirmErr } = await sb
        .from("polls")
        .update({
          status: "confirmed",
          confirmed_option_id: winner.id,
          updated_at: new Date().toISOString(),
        })
        .eq("id", poll.id);
      if (confirmErr) {
        summary.errors.push(`confirm ${poll.id}: ${confirmErr.message}`);
        continue;
      }
      summary.confirmed.push(poll.id);
    } else {
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
  }

  // 2. Auto-create the next two first/last weekend polls if absent.
  // The `polls.created_by` column is NOT NULL with a FK to auth.users —
  // the cron has no logged-in user, so we attribute these auto-created
  // polls to the first admin we can find. If no admin exists yet (fresh
  // deploy before anyone's been promoted), skip auto-creation rather
  // than choke on the constraint.
  const { data: adminRow } = await sb
    .from("users")
    .select("user_id")
    .eq("is_admin", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const cronActorId: string | null = adminRow?.user_id ?? null;

  if (!cronActorId) {
    summary.errors.push(
      "skipped auto-create: no admin user exists yet — promote someone via users.is_admin = true.",
    );
  } else {
    const targets = upcomingFirstAndLastWeekends(new Date(), 2);
    for (const slot of targets) {
      const friday = slot.friday.toISOString().split("T")[0];
      const { data: existing } = await sb
        .from("polls")
        .select("id")
        .eq("weekend_start_date", friday)
        .limit(1);
      if (existing && existing.length > 0) continue;
      const { data: inserted, error: insertErr } = await sb
        .from("polls")
        .insert({
          weekend_start_date: friday,
          status: "open",
          min_players: DEFAULT_MIN_PLAYERS,
          created_by: cronActorId,
          notes: `Auto-created by housekeeping for ${slot.position} weekend of ${slot.monthLabel}`,
        })
        .select("id")
        .single();
      if (insertErr) {
        summary.errors.push(`create ${friday}: ${insertErr.message}`);
        continue;
      }
      summary.created.push(inserted.id);
    }
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
