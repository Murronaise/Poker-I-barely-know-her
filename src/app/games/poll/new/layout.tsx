import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/auth";

// Same pattern as /games/create — server-side admin gate so direct URL
// access doesn't work for non-admins.
export default async function NewPollLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const sb = await createSupabaseServerClient();
  const { data: { user } } = await sb.auth.getUser();

  if (!user) {
    redirect("/login?message=Please+log+in+to+create+polls.");
  }

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
