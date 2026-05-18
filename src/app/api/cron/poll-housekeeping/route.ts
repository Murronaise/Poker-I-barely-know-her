// Daily poll-housekeeping cron.
//
// What it does:
//   1. Auto-cancels open polls whose weekend is < 24h away and which
//      haven't hit min_players in yes votes.
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
import { DEFAULT_MIN_PLAYERS, upcomingFirstAndLastWeekends } from "@/lib/polls";

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
    created: [] as string[],
    errors: [] as string[],
  };

  // 1. Auto-cancel under-quorum polls.
  const now = new Date();
  const cutoff = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const cutoffIso = cutoff.toISOString().split("T")[0];

  const { data: openPolls, error: openErr } = await sb
    .from("polls")
    .select("id, min_players, weekend_start_date")
    .eq("status", "open")
    .lte("weekend_start_date", cutoffIso);
  if (openErr) {
    summary.errors.push(`open polls fetch: ${openErr.message}`);
  }

  for (const poll of openPolls ?? []) {
    const { count } = await sb
      .from("rsvps")
      .select("id", { count: "exact", head: true })
      .eq("poll_id", poll.id)
      .eq("response", "yes");
    const yesCount = count ?? 0;
    const threshold = poll.min_players ?? DEFAULT_MIN_PLAYERS;
    if (yesCount >= threshold) continue;
    const { error: updateErr } = await sb
      .from("polls")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("id", poll.id);
    if (updateErr) {
      summary.errors.push(`cancel ${poll.id}: ${updateErr.message}`);
      continue;
    }
    summary.cancelled.push(poll.id);
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
