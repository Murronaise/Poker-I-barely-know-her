// Daily settlement-reminder cron.
//
// What it does: scans every historical game, identifies players whose
// outstanding balance is older than `REMINDER_AFTER_DAYS` and still
// unsettled, and posts a single summary message to the configured webhook
// URL (Discord, Slack, or any compatible endpoint).
//
// Trigger: configure Vercel Cron (or any external scheduler) to POST this
// endpoint daily. Same auth model as poll-housekeeping —
// `Authorization: Bearer <CRON_SECRET>` or `?token=`.
//
// Required env vars:
//   * CRON_SECRET                    — shared secret
//   * SUPABASE_SERVICE_ROLE_KEY      — bypasses RLS for the read
//   * REMINDER_WEBHOOK_URL           — POST target (Discord-shape)
// Optional:
//   * REMINDER_AFTER_DAYS            — default 7
//   * REMINDER_MAX_PLAYERS           — cap so the message stays scannable

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { computeLedger, loadAllSettlements } from "@/lib/ledger";
import { historicalGames } from "@/lib/historical-games";
import { ADMIN_PLAYER } from "@/lib/local-store";

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

async function runReminder() {
  const reminderAfterDays = Number(process.env.REMINDER_AFTER_DAYS ?? "7");
  const maxPlayers = Number(process.env.REMINDER_MAX_PLAYERS ?? "20");
  const webhookUrl = process.env.REMINDER_WEBHOOK_URL;

  if (!webhookUrl) {
    return { ok: false, skipped: true, reason: "REMINDER_WEBHOOK_URL not configured" };
  }

  const sb = createSupabaseServiceClient();
  const settlements = await loadAllSettlements(sb);
  const ledger = computeLedger(historicalGames, settlements);

  const now = Date.now();
  const thresholdMs = reminderAfterDays * 24 * 60 * 60 * 1000;

  type Owed = { name: string; pence: number; oldestDate: string };
  const debtors: Owed[] = [];
  const creditors: Owed[] = [];

  ledger.forEach((entry) => {
    if (entry.unsettled.length === 0) return;
    // Use the oldest unsettled session's date as a proxy for "how long has
    // this been outstanding?". historicalGames.date is a human string like
    // "May 1, 2026" — Date.parse handles that.
    const oldest = entry.unsettled.reduce(
      (acc, s) => (acc < s.date ? acc : s.date),
      entry.unsettled[0].date,
    );
    const oldestTs = Date.parse(oldest);
    if (!Number.isFinite(oldestTs)) return;
    if (now - oldestTs < thresholdMs) return;
    const row: Owed = {
      name: entry.displayName,
      pence: Math.abs(entry.outstandingPence),
      oldestDate: oldest,
    };
    if (entry.outstandingPence < 0) debtors.push(row);
    else creditors.push(row);
  });

  debtors.sort((a, b) => b.pence - a.pence);
  creditors.sort((a, b) => b.pence - a.pence);

  if (debtors.length === 0 && creditors.length === 0) {
    return { ok: true, skipped: true, reason: "nothing outstanding past threshold" };
  }

  const formatPence = (p: number) =>
    `£${(p / 100).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const lines: string[] = [];
  lines.push(`📒 **Poker settlement reminder** (over ${reminderAfterDays} days unsettled)`);
  if (debtors.length > 0) {
    lines.push("");
    lines.push(`**Owe ${ADMIN_PLAYER}:**`);
    for (const d of debtors.slice(0, maxPlayers)) {
      lines.push(`• ${d.name} — ${formatPence(d.pence)} (since ${d.oldestDate})`);
    }
  }
  if (creditors.length > 0) {
    lines.push("");
    lines.push(`**${ADMIN_PLAYER} still owes:**`);
    for (const c of creditors.slice(0, maxPlayers)) {
      lines.push(`• ${c.name} — ${formatPence(c.pence)} (since ${c.oldestDate})`);
    }
  }

  // Discord-style payload — Slack accepts the same { content: "..." }
  // shape via incoming webhooks, so this works for both providers.
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: lines.join("\n") }),
  });

  if (!res.ok) {
    return {
      ok: false,
      skipped: false,
      status: res.status,
      reason: `webhook responded ${res.status}`,
      preview: lines.slice(0, 6).join("\n"),
    };
  }

  return {
    ok: true,
    skipped: false,
    debtorCount: debtors.length,
    creditorCount: creditors.length,
  };
}

export async function GET(req: NextRequest) {
  const auth = requireCronAuth(req);
  if (auth) return auth;
  const summary = await runReminder();
  return NextResponse.json(summary);
}

export async function POST(req: NextRequest) {
  const auth = requireCronAuth(req);
  if (auth) return auth;
  const summary = await runReminder();
  return NextResponse.json(summary);
}
