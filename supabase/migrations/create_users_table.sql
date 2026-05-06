-- ============================================================================
-- Users table + RLS + auto-create trigger
-- ----------------------------------------------------------------------------
-- Run this in your Supabase SQL Editor to set up the auth-related schema.
-- It is idempotent — safe to re-run if you need to update policies.
-- ============================================================================

-- Profile rows for authenticated users. The PK is the auth.users uuid so
-- there's exactly one profile per auth user, enforced by the FK + UNIQUE.
CREATE TABLE IF NOT EXISTS users (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  player_name TEXT NOT NULL,
  is_admin BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT users_player_name_length CHECK (char_length(player_name) BETWEEN 2 AND 24)
);

-- Case-insensitive uniqueness on player_name so "Toby" and "toby" can't both
-- exist. Using a unique index on lower(player_name) lets us keep the original
-- casing in the column for display.
CREATE UNIQUE INDEX IF NOT EXISTS users_player_name_lower_uniq
  ON users (lower(player_name));

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- ----------------------------------------------------------------------------
-- Auto-create profile when an auth user signs up. This runs in the same
-- transaction as the auth.users insert, so we never end up with an auth user
-- that has no matching profile row (the "orphan" bug).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  derived_name TEXT;
BEGIN
  -- Prefer the player_name passed via signUp options.data; fall back to the
  -- email local-part so legacy/manual auth users still get a sensible row.
  derived_name := COALESCE(
    NEW.raw_user_meta_data->>'player_name',
    split_part(NEW.email, '@', 1),
    'Player'
  );

  INSERT INTO public.users (user_id, email, player_name, is_admin)
  VALUES (NEW.id, NEW.email, derived_name, false)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- ----------------------------------------------------------------------------
-- Keep updated_at fresh on any UPDATE.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.touch_users_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_set_updated_at ON public.users;
CREATE TRIGGER users_set_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.touch_users_updated_at();

-- ----------------------------------------------------------------------------
-- Row Level Security
--   * Anyone (logged in or anon) can read profiles — leaderboards, history
--     pages, and the navbar all need this.
--   * Only the row's owner can insert (matches auth.uid()).
--   * Only the row's owner can update, AND they cannot toggle is_admin from
--     the client. is_admin can only be changed in the dashboard / via SQL.
-- ----------------------------------------------------------------------------
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read their own profile" ON users;
DROP POLICY IF EXISTS "Users can read all profiles" ON users;
DROP POLICY IF EXISTS "Users can insert their own profile" ON users;
DROP POLICY IF EXISTS "Users can update their own profile" ON users;
DROP POLICY IF EXISTS "Enable read access for all users" ON users;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON users;
DROP POLICY IF EXISTS "Enable update for users based on email" ON users;
DROP POLICY IF EXISTS "allow_read" ON users;
DROP POLICY IF EXISTS "allow_insert" ON users;
DROP POLICY IF EXISTS "allow_update" ON users;

CREATE POLICY "users_select_all"
  ON users FOR SELECT
  USING (true);

CREATE POLICY "users_insert_own"
  ON users FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- The CHECK clause prevents a user from flipping their own is_admin flag.
-- (USING gates which rows you can target; WITH CHECK gates the resulting row.)
CREATE POLICY "users_update_own_non_admin_fields"
  ON users FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND is_admin = (SELECT u.is_admin FROM public.users u WHERE u.user_id = auth.uid())
  );
