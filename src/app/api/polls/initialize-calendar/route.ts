// POST /api/polls/initialize-calendar
//
// Initializes the yearly calendar for the given year.
// Creates a single "Yearly Calendar" poll in the database and pre-populates
// all weekends (Fri, Sat, Sun) and UK bank holidays as poll options.
//
// Auth: requires a signed-in admin.

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { isAdminDb } from "@/lib/auth";
import { toIsoDate } from "@/lib/bank-holidays";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
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

  const body = (await req.json().catch(() => ({}))) as { year?: number };
  const year = body.year ?? new Date().getFullYear();

  const sb = createSupabaseServiceClient();

  // Check if calendar already initialized
  const weekendStartIso = `${year}-01-01`;
  const { data: existing } = await sb
    .from("polls")
    .select("id")
    .eq("weekend_start_date", weekendStartIso)
    .limit(1);

  if (existing && existing.length > 0) {
    return NextResponse.json({ ok: true, created: false, pollId: existing[0].id });
  }

  // Fetch UK Bank holidays
  const bankHolidays = new Map<string, string>();
  try {
    const res = await fetch("https://www.gov.uk/bank-holidays.json", {
      next: { revalidate: 60 * 60 * 24 },
    });
    if (res.ok) {
      const data = await res.json();
      const division = data["england-and-wales"];
      if (division && division.events) {
        for (const ev of division.events) {
          bankHolidays.set(ev.date, ev.title);
        }
      }
    }
  } catch (err) {
    console.error("[initialize-calendar] failed to load gov.uk feed", err);
  }

  // Create the poll
  const { data: insertedPoll, error: insertErr } = await sb
    .from("polls")
    .insert({
      weekend_start_date: weekendStartIso,
      status: "open",
      created_by: user.id,
      notes: `Yearly Calendar ${year}`,
      min_players: 4,
    })
    .select("id")
    .single();

  if (insertErr || !insertedPoll) {
    return NextResponse.json(
      { ok: false, error: insertErr?.message ?? "Failed to insert poll" },
      { status: 500 }
    );
  }

  // Generate all playable days (Fri, Sat, Sun if Mon is BH)
  const optionRows = [];
  const start = new Date(year, 0, 1);
  const end = new Date(year, 11, 31);
  
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const iso = toIsoDate(d);
    const isFri = d.getDay() === 5;
    const isSat = d.getDay() === 6;
    const isSun = d.getDay() === 0;

    const nextDay = new Date(d);
    nextDay.setDate(nextDay.getDate() + 1);
    const nextIso = toIsoDate(nextDay);
    const nextDayBankHolidayName = isSun ? bankHolidays.get(nextIso) : null;

    if (isFri || isSat || (isSun && nextDayBankHolidayName)) {
      let label = "";
      if (isSun && nextDayBankHolidayName) {
        label = `Sunday (${nextDayBankHolidayName} Mon)`;
      } else {
        label = isFri ? "Friday" : "Saturday";
      }

      optionRows.push({
        poll_id: insertedPoll.id,
        game_date: iso,
        start_time: "19:30:00",
        label,
        is_bank_holiday: isSun && !!nextDayBankHolidayName,
      });
    }
  }

  // Batch insert options
  const chunkSize = 100;
  for (let i = 0; i < optionRows.length; i += chunkSize) {
    const chunk = optionRows.slice(i, i + chunkSize);
    const { error: optsErr } = await sb.from("poll_options").insert(chunk);
    if (optsErr) {
      console.error("[initialize-calendar] error inserting options chunk:", optsErr);
      // We don't rollback the poll itself here, it's safer to retry or let it be partially initialized
    }
  }

  return NextResponse.json({
    ok: true,
    created: true,
    pollId: insertedPoll.id,
    optionCount: optionRows.length,
  });
}
