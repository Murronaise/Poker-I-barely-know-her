// Admin checks come in two flavours:
//
//  1. `isAdmin(email)` — synchronous email allow-list check, safe to use
//     anywhere (client or server). Used for fast-path UI gating.
//
//  2. `isAdminDb(supabase, email)` — async DB lookup against `users.is_admin`.
//     Used on the server when we need authoritative permission to mutate
//     state. Falls back to the email check if the DB query fails.

import type { SupabaseClient } from "@supabase/supabase-js";

export const ADMIN_EMAIL = "rebelpie@gmail.com";

export function isAdmin(email?: string | null): boolean {
  return !!email && email.toLowerCase() === ADMIN_EMAIL.toLowerCase();
}

export async function isAdminDb(
  sb: SupabaseClient,
  email?: string | null,
): Promise<boolean> {
  if (!email) return false;
  if (isAdmin(email)) return true;

  try {
    const { data } = await sb
      .from("users")
      .select("is_admin")
      .eq("email", email)
      .maybeSingle();
    return data?.is_admin === true;
  } catch {
    return false;
  }
}
