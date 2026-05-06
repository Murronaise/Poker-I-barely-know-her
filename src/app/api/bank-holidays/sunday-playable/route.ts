import { NextRequest, NextResponse } from "next/server";
import { isSundayPlayable } from "@/lib/bank-holidays";

// Thin wrapper so the create-poll page (client component) can ask the
// gov.uk feed without exposing fetch-revalidate config to the browser.
// GET /api/bank-holidays/sunday-playable?date=YYYY-MM-DD
export async function GET(req: NextRequest) {
  const dateParam = req.nextUrl.searchParams.get("date");
  if (!dateParam) {
    return NextResponse.json({ error: "Missing ?date=YYYY-MM-DD" }, { status: 400 });
  }

  const sunday = new Date(dateParam + "T00:00:00");
  if (Number.isNaN(sunday.getTime())) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }

  const result = await isSundayPlayable(sunday);
  return NextResponse.json(result);
}
