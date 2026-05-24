// POST /api/polls/create-monthly
//
// Creates the next "monthly boundary pair" poll: one poll with options
// spanning the last weekend of monthN AND the first weekend of monthN+1.
// Triggered from the live game's End Game flow and from any future
// admin-driven button. Idempotent — if a poll already exists keyed on the
// computed last-Friday-of-monthN, the endpoint returns 200 with
// `{ created: false }` rather than failing.
//
// Options per poll:
//   - Friday + Saturday of the last weekend of monthN.
//   - Friday + Saturday of the first weekend of monthN+1.
//   - Sunday of either weekend ONLY if the following Monday is a UK bank
//     holiday (the existing "Sunday is playable" rule).
//
// Auth: requires a signed-in admin (Supabase session + users.is_admin OR
// the email allow-list).

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { isAdminDb } from "@/lib/auth";
import { nextMonthlyBoundaryPair } from "@/lib/polls";
import { isSundayPlayable, toIsoDate } from "@/lib/bank-holidays";

export const dynamic = "force-dynamic";

type OptionInput = {
  game_date: string;
  label: string;
  is_bank_holiday: boolean;
};

async function buildWeekendOptions(friday: Date): Promise<OptionInput[]> {
  const saturday = new Date(friday);
  saturday.setDate(saturday.getDate() + 1);
  const sunday = new Date(friday);
  sunday.setDate(sunday.getDate() + 2);

  const { playable: sundayPlayable, holidayName } = await isSundayPlayable(sunday);

  const opts: OptionInput[] = [
    { game_date: toIsoDate(friday), label: "Friday", is_bank_holiday: false },
    { game_date: toIsoDate(saturday), label: "Saturday", is_bank_holiday: false },
  ];
  if (sundayPlayable) {
    opts.push({
      game_date: toIsoDate(sunday),
      label: holidayName ? `Sunday (${holidayName} Mon)` : "Sunday",
      is_bank_holiday: true,
    });
  }
  return opts;
}

export async function POST(req: NextRequest) {
  // Resolve the requester and verify they're an admin. We accept either
  // the email allow-list or users.is_admin = true.
  const userClient = await createSupabaseServerClient();
  const { data: authData } = await userClient.auth.getUser();
  const user = authData.user;
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorised" }, { status: 401 });
  }
  const admin = await isAdminDb(userClient, user.email);
  if (!admin) {
    return NextResponse.json({ ok: false, error: "admin only" }, { status: 403 });
  }

  // Optional ?anchor=YYYY-MM-DD lets a manual trigger override "now"; the
  // game-end caller leaves it blank so the pair is computed from today.
  const body = (await req.json().catch(() => ({}))) as { anchor?: string };
  const anchor = body.anchor
    ? new Date(body.anchor + "T00:00:00")
    : new Date();
  if (Number.isNaN(anchor.getTime())) {
    return NextResponse.json({ ok: false, error: "invalid anchor" }, { status: 400 });
  }

  const { lastFriday, firstFridayNext } = nextMonthlyBoundaryPair(anchor);

  // Idempotent — bail early if a poll already exists for this pair. We
  // dedupe on the EARLIEST Friday because that's what we use as
  // weekend_start_date on the row.
  const earliestFridayIso = toIsoDate(lastFriday);
  const sb = createSupabaseServiceClient();
  const { data: existing } = await sb
    .from("polls")
    .select("id")
    .eq("weekend_start_date", earliestFridayIso)
    .limit(1);
  if (existing && existing.length > 0) {
    return NextResponse.json({ ok: true, created: false, pollId: existing[0].id });
  }

  // Build the option list before we insert the parent row so we can fail
  // cleanly (no orphan polls) if the bank-holiday lookup throws.
  const optionsForLast = await buildWeekendOptions(lastFriday);
  const optionsForFirst = await buildWeekendOptions(firstFridayNext);
  const optionRows = [...optionsForLast, ...optionsForFirst];

  // Insert the poll. created_by must reference an auth.users row (NOT
  // NULL + FK) so we attribute it to the triggering admin.
  const { data: inserted, error: insertErr } = await sb
    .from("polls")
    .insert({
      weekend_start_date: earliestFridayIso,
      status: "open",
      created_by: user.id,
      notes: `Auto-created after game-end — covers late ${lastFriday.toLocaleDateString(
        "en-GB",
        { month: "long" },
      )} into early ${firstFridayNext.toLocaleDateString("en-GB", { month: "long" })}.`,
    })
    .select("id")
    .single();
  if (insertErr || !inserted) {
    return NextResponse.json(
      { ok: false, error: insertErr?.message ?? "insert failed" },
      { status: 500 },
    );
  }

  // poll_options needs start_time (NOT NULL). The group's actual flow is
  // "start when 4 players have shown up", but the column requires SOME
  // value, so we store a placeholder of 20:00 — never surfaced as
  // authoritative anywhere we render polls.
  const optionsPayload = optionRows.map((o) => ({
    poll_id: inserted.id,
    game_date: o.game_date,
    start_time: "20:00:00",
    label: o.label,
    is_bank_holiday: o.is_bank_holiday,
  }));
  const { error: optsErr } = await sb.from("poll_options").insert(optionsPayload);
  if (optsErr) {
    // Roll back so we don't leave another empty scaffold like the one
    // we just deprecated.
    await sb.from("polls").delete().eq("id", inserted.id);
    return NextResponse.json(
      { ok: false, error: `poll_options insert: ${optsErr.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    created: true,
    pollId: inserted.id,
    optionCount: optionsPayload.length,
  });
}
