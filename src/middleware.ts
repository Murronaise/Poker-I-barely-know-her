import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

const VISITOR_COOKIE = "pt_visitor_id";
// 1 year — enough that we can recognise an anon visitor across separate
// browsing sessions (which is the whole point of the cookie).
const VISITOR_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  // Stable per-browser identifier for anonymous visitor tracking. Signed-in
  // requests prefer the auth user_id, but every visitor (anon or not) gets a
  // cookie so we never lose track if they sign in/out mid-session.
  if (!request.cookies.get(VISITOR_COOKIE)?.value) {
    response.cookies.set(VISITOR_COOKIE, crypto.randomUUID(), {
      maxAge: VISITOR_COOKIE_MAX_AGE,
      sameSite: "lax",
      httpOnly: false, // readable from JS so the visit tracker can post it back
      path: "/",
    });
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
