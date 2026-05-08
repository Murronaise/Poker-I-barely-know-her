import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const VISITOR_COOKIE = "pt_visitor_id";

// Skip noisy paths that aren't real navigation events. The admin dashboard
// reading itself shouldn't pollute the feed either.
const SKIP_PATH_PREFIXES = [
  "/api/",
  "/_next/",
  "/admin/visits",
];

export async function POST(request: Request) {
  let body: { path?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 });
  }

  const path = typeof body.path === "string" ? body.path : null;
  if (!path) {
    return NextResponse.json({ ok: false, error: "missing path" }, { status: 400 });
  }
  if (SKIP_PATH_PREFIXES.some((p) => path === p || path.startsWith(p))) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const sb = await createSupabaseServerClient();
  const { data: { user } } = await sb.auth.getUser();

  // Pull player_name for signed-in users so the admin panel can render it
  // without an extra join.
  let playerName: string | null = null;
  if (user?.email) {
    const { data: profile } = await sb
      .from("users")
      .select("player_name")
      .eq("email", user.email)
      .maybeSingle();
    playerName = profile?.player_name ?? null;
  }

  // The middleware sets a uuid cookie on every request, so this should
  // always be populated. Fall back to a one-off uuid just in case.
  const cookieVal = request.headers.get("cookie") ?? "";
  const cookieMatch = cookieVal.match(new RegExp(`(?:^|; )${VISITOR_COOKIE}=([^;]+)`));
  const anonCookie = cookieMatch?.[1] ?? crypto.randomUUID();

  // Signed-in visitors are keyed by user_id so the same person across two
  // browsers groups together; anon visitors are keyed by their cookie.
  const visitorKey = user ? `u:${user.id}` : `a:${anonCookie}`;

  const userAgent = request.headers.get("user-agent") ?? null;
  const referer = request.headers.get("referer") ?? null;

  const { error } = await sb.from("site_visits").insert({
    visitor_key: visitorKey,
    user_id: user?.id ?? null,
    email: user?.email ?? null,
    player_name: playerName,
    path,
    user_agent: userAgent?.slice(0, 500) ?? null,
    referer: referer?.slice(0, 500) ?? null,
  });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
