import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/auth";

// Server-side gate: even if a non-admin somehow opens /games/create, this
// layout runs first and redirects them. Hiding the button in the UI is not
// enough — direct URL access has to be blocked too.
export default async function GamesCreateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const sb = await createSupabaseServerClient();
  const { data: { user } } = await sb.auth.getUser();

  if (!user) {
    redirect("/login?message=Please+log+in+to+create+games.");
  }

  // First check the email allow-list (cheap, no DB hit). If that fails fall
  // back to the users.is_admin column so DB-promoted admins still pass.
  if (!isAdmin(user.email)) {
    const { data: profile } = await sb
      .from("users")
      .select("is_admin")
      .eq("email", user.email!)
      .maybeSingle();

    if (!profile?.is_admin) {
      redirect("/games?message=Admin+access+required.");
    }
  }

  return <>{children}</>;
}
