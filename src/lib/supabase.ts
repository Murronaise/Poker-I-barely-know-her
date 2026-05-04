import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const missing = !supabaseUrl || !supabaseAnonKey;

if (missing && typeof window !== "undefined") {
  console.warn(
    "[supabase] NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are not set. " +
      "Network calls will be skipped and the UI will fall back to placeholder data.",
  );
}

// Tiny no-op client surface so callers can `await supabase.from(...).select(...)`
// safely when env vars are missing — they get back `{ data: null, error: ... }`
// instead of a crash inside `createClient`.
function createStubClient(): SupabaseClient {
  const noResult = { data: null, error: new Error("Supabase env vars are not configured") };
  const queryStub: Record<string, (...args: unknown[]) => unknown> = {
    select: () => Promise.resolve(noResult),
    insert: () => Promise.resolve(noResult),
    upsert: () => Promise.resolve(noResult),
    update: () => Promise.resolve(noResult),
    delete: () => Promise.resolve(noResult),
    eq: () => queryStub,
    ilike: () => queryStub,
    single: () => Promise.resolve(noResult),
  };
  const storageStub = {
    upload: () => Promise.resolve(noResult),
    getPublicUrl: () => ({ data: { publicUrl: "" } }),
  };
  return {
    from: () => queryStub,
    storage: { from: () => storageStub },
  } as unknown as SupabaseClient;
}

export const supabase: SupabaseClient = missing
  ? createStubClient()
  : createClient(supabaseUrl!, supabaseAnonKey!);

export const isSupabaseConfigured = !missing;
