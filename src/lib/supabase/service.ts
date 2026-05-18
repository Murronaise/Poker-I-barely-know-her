// Service-role Supabase client for server-side jobs that must bypass RLS
// (cron handlers, webhooks, anything that runs without a logged-in user).
//
// SECURITY: the service-role key has full database access — never expose
// it to the browser, never proxy it through public route params. The key
// is read from `SUPABASE_SERVICE_ROLE_KEY` (server-only env var). If it's
// missing we throw loudly so a misconfigured deployment can't accidentally
// fall back to the anon key and either silently fail (RLS rejection) or,
// worse, succeed in a way that defeats the security model elsewhere.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function createSupabaseServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not configured.");
  }
  if (!serviceKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not configured — server-side jobs need it to bypass RLS.",
    );
  }
  return createClient(url, serviceKey, {
    auth: {
      // No sessions / refresh on a service client — it has no "user".
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
