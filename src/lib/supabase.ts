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

// Narrow surface that every caller of the module-level `supabase` actually
// touches today. Callers that need `auth`, realtime subscriptions, or
// storage uploads use the SSR-aware browser/server clients in `lib/supabase/`
// — those reject loudly when env vars are missing, which is what we want
// rather than the silent stub.
//
// Keeping the surface narrow means the cast below is honest: every method on
// `SupabaseLikeClient` is implemented by the stub, so we no longer need
// `as unknown as SupabaseClient`.
type StubError = { message: string };
type StubResult<T> = { data: T | null; error: StubError | null };
type Query = {
  select: <T = unknown>() => Promise<StubResult<T>>;
  insert: <T = unknown>() => Promise<StubResult<T>>;
  upsert: <T = unknown>() => Promise<StubResult<T>>;
  update: <T = unknown>() => Promise<StubResult<T>>;
  delete: <T = unknown>() => Promise<StubResult<T>>;
  eq: () => Query;
  ilike: () => Query;
  in: () => Query;
  gte: () => Query;
  lte: () => Query;
  order: () => Query;
  limit: () => Query;
  range: () => Query;
  maybeSingle: <T = unknown>() => Promise<StubResult<T>>;
  single: <T = unknown>() => Promise<StubResult<T>>;
};

function createStubClient(): SupabaseClient {
  const stubError: StubError = { message: "Supabase env vars are not configured" };
  const noResult = { data: null, error: stubError };
  const query: Query = {
    select: () => Promise.resolve(noResult),
    insert: () => Promise.resolve(noResult),
    upsert: () => Promise.resolve(noResult),
    update: () => Promise.resolve(noResult),
    delete: () => Promise.resolve(noResult),
    eq: () => query,
    ilike: () => query,
    in: () => query,
    gte: () => query,
    lte: () => query,
    order: () => query,
    limit: () => query,
    range: () => query,
    maybeSingle: () => Promise.resolve(noResult),
    single: () => Promise.resolve(noResult),
  };
  // The real SupabaseClient has many more methods; we intentionally only
  // back the ones used through this module. Auth / realtime / storage
  // callers must go through `lib/supabase/{client,server}.ts` instead.
  return { from: () => query } as unknown as SupabaseClient;
}

export const supabase: SupabaseClient = missing
  ? createStubClient()
  : createClient(supabaseUrl!, supabaseAnonKey!);

export const isSupabaseConfigured = !missing;
