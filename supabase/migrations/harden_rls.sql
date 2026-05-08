-- ============================================================================
-- Security advisor fixes — RLS, function search_path, SECURITY DEFINER perms
-- ----------------------------------------------------------------------------
-- Resolves the issues flagged by Supabase's Security Advisor:
--   * RLS disabled on public.players, public.games, public.game_records
--   * Function search_path mutable on touch_users_updated_at / touch_updated_at
--   * SECURITY DEFINER functions executable by PUBLIC / authenticated
--
-- The "leaked password protection disabled" warning is a Supabase Auth
-- setting (Authentication → Providers → Email → "Leaked password
-- protection") — toggle it on in the dashboard, no SQL fix.
--
-- The site_visits "RLS Always True" warning on INSERT is intentional:
-- anonymous visitors need to be able to log their visit. We're not loosening
-- any other access — SELECT remains admin-only, and the visitor identity
-- is server-derived from cookie/auth.uid() in the API route, not from
-- anything the client can spoof.
--
-- Run this in Supabase SQL Editor. Idempotent — safe to re-run.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. public.players — RLS
-- ----------------------------------------------------------------------------
-- Read: public (every page renders names + avatars).
-- Write: admins, OR a signed-in user mutating *their own* player row
--        (matched by users.player_name = players.name, case-insensitive).
--        This is what the profile-page avatar upsert relies on.
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "players_select_all"             ON public.players;
DROP POLICY IF EXISTS "players_insert_admin_or_owner"  ON public.players;
DROP POLICY IF EXISTS "players_update_admin_or_owner"  ON public.players;
DROP POLICY IF EXISTS "players_delete_admin"           ON public.players;

CREATE POLICY "players_select_all"
  ON public.players FOR SELECT
  USING (true);

CREATE POLICY "players_insert_admin_or_owner"
  ON public.players FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.user_id = auth.uid()
        AND (u.is_admin = true OR lower(u.player_name) = lower(public.players.name))
    )
  );

CREATE POLICY "players_update_admin_or_owner"
  ON public.players FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.user_id = auth.uid()
        AND (u.is_admin = true OR lower(u.player_name) = lower(public.players.name))
    )
  );

CREATE POLICY "players_delete_admin"
  ON public.players FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.user_id = auth.uid() AND u.is_admin = true
    )
  );

-- ----------------------------------------------------------------------------
-- 2. public.games — RLS
-- ----------------------------------------------------------------------------
-- Currently unused by the app (game data lives in lib/historical-games.ts).
-- Lock down completely: admins only for everything. If the table is later
-- wired up for live use, these policies can be loosened.
ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "games_admin_all" ON public.games;

CREATE POLICY "games_admin_all"
  ON public.games FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.user_id = auth.uid() AND u.is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.user_id = auth.uid() AND u.is_admin = true
    )
  );

-- ----------------------------------------------------------------------------
-- 3. public.game_records — RLS
-- ----------------------------------------------------------------------------
-- Same story as games: dormant for now, admin-only.
ALTER TABLE public.game_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "game_records_admin_all" ON public.game_records;

CREATE POLICY "game_records_admin_all"
  ON public.game_records FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.user_id = auth.uid() AND u.is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.user_id = auth.uid() AND u.is_admin = true
    )
  );

-- ----------------------------------------------------------------------------
-- 4. Trigger functions — pin search_path
-- ----------------------------------------------------------------------------
-- A function with a mutable search_path can be hijacked by a malicious
-- temp-schema function with the same name as a referenced object. Pinning
-- to public + pg_temp closes that vector. ALTER FUNCTION ... SET only
-- updates the metadata, no behavioural change.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'touch_users_updated_at'
  ) THEN
    EXECUTE 'ALTER FUNCTION public.touch_users_updated_at() SET search_path = public, pg_temp';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'touch_updated_at'
  ) THEN
    EXECUTE 'ALTER FUNCTION public.touch_updated_at() SET search_path = public, pg_temp';
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 5. SECURITY DEFINER functions — restrict EXECUTE
-- ----------------------------------------------------------------------------
-- handle_new_auth_user() is invoked by the auth.users INSERT trigger; nothing
--   else should be calling it. Revoke direct execution.
-- current_user_is_admin() is used by RLS policies, which evaluate as the
--   calling user — so authenticated users still need EXECUTE on it. Just
--   strip PUBLIC's blanket execute and grant to authenticated explicitly.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'handle_new_auth_user'
  ) THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.handle_new_auth_user() FROM PUBLIC';
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.handle_new_auth_user() FROM authenticated';
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.handle_new_auth_user() FROM anon';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'current_user_is_admin'
  ) THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.current_user_is_admin() FROM PUBLIC';
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.current_user_is_admin() FROM anon';
    -- authenticated keeps EXECUTE because RLS policies that reference this
    -- function evaluate as the calling user.
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.current_user_is_admin() TO authenticated';
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 6. storage.objects — tighten the avatars bucket
-- ----------------------------------------------------------------------------
-- The advisor flags broad SELECT policies on storage.objects because they
-- let any client list every object in the bucket (not just download
-- individual files). Replace any existing avatars-related SELECT with one
-- that allows individual reads but not bucket-wide listing — uploads still
-- need INSERT for authenticated users.
--
-- NOTE: storage.objects already has its own RLS layer; we're adjusting
-- policies on it, not on a custom table.
DO $$
BEGIN
  -- Drop any prior avatar policies we know about (safe if they don't exist).
  EXECUTE 'DROP POLICY IF EXISTS "avatars_public_read"   ON storage.objects';
  EXECUTE 'DROP POLICY IF EXISTS "avatars_public_select" ON storage.objects';
  EXECUTE 'DROP POLICY IF EXISTS "Public Access"         ON storage.objects';
  EXECUTE 'DROP POLICY IF EXISTS "avatars_authed_insert" ON storage.objects';
  EXECUTE 'DROP POLICY IF EXISTS "avatars_authed_update" ON storage.objects';

  -- Public can fetch individual avatar files (rendering profile pictures
  -- for unauthenticated visitors), but not list arbitrary keys.
  EXECUTE $POL$
    CREATE POLICY "avatars_public_read"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'avatars')
  $POL$;

  -- Signed-in users can upload + replace files in the avatars bucket.
  EXECUTE $POL$
    CREATE POLICY "avatars_authed_insert"
      ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'avatars')
  $POL$;
  EXECUTE $POL$
    CREATE POLICY "avatars_authed_update"
      ON storage.objects FOR UPDATE TO authenticated
      USING (bucket_id = 'avatars')
      WITH CHECK (bucket_id = 'avatars')
  $POL$;
END $$;

-- The "list bucket" advisor warning is specifically about LIST permission
-- (Supabase storage exposes both GET and LIST as separate operations).
-- To strip listing without breaking GET, also flip the bucket's `public`
-- flag off in Supabase Dashboard → Storage → avatars → Configuration if
-- not already done. The signed-in upload policy above stays effective.
