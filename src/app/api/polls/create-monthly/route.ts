// POST /api/polls/create-monthly
//
// Legacy endpoint for creating monthly boundary pair polls.
// Now a no-op because the system has migrated to a year-round calendar poll.
// Triggered from the live game's End Game flow.

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  return NextResponse.json({
    ok: true,
    created: false,
    message: "Calendar system is active. Monthly poll creation is deprecated.",
  });
}
