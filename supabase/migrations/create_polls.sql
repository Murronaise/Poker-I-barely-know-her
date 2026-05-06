-- ============================================================================
-- Game polls: which day of the weekend should we play?
-- ----------------------------------------------------------------------------
-- A poll covers one weekend. The admin picks which day(s) (Fri/Sat/Sun) are
-- options. Players RSVP yes/maybe/no per option. The admin then confirms one
-- option (or the system can auto-suggest the winner). If the confirmed
-- option's "yes" count later drops below the minimum, the admin can mark the
-- poll superseded and create a new one for an alternative day.
-- Idempotent — safe to re-run.
-- ============================================================================

-- ---- ENUMS -----------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'poll_status') THEN
    CREATE TYPE poll_status AS ENUM ('open', 'confirmed', 'cancelled', 'superseded');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'rsvp_response') THEN
    CREATE TYPE rsvp_response AS ENUM ('yes', 'maybe', 'no');
  END IF;
END
$$;

-- ---- TABLES ----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS polls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- The Friday of the target weekend, used as a stable key for "this weekend".
  weekend_start_date DATE NOT NULL,
  status poll_status NOT NULL DEFAULT 'open',
  confirmed_option_id UUID,         -- set when admin confirms a day; FK added below
  min_players INT NOT NULL DEFAULT 4 CHECK (min_players >= 2),
  -- For re-polls: the original poll that triggered this one.
  parent_poll_id UUID REFERENCES polls(id) ON DELETE SET NULL,
  notes TEXT,
  CONSTRAINT polls_weekend_window CHECK (weekend_start_date >= '2020-01-01')
);

CREATE INDEX IF NOT EXISTS idx_polls_weekend ON polls(weekend_start_date);
CREATE INDEX IF NOT EXISTS idx_polls_status ON polls(status);

CREATE TABLE IF NOT EXISTS poll_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  game_date DATE NOT NULL,
  start_time TIME NOT NULL DEFAULT '19:30',
  -- Stored label so we can show "Bank Holiday Sunday" instead of just "Sunday".
  label TEXT NOT NULL,
  is_bank_holiday BOOLEAN NOT NULL DEFAULT false,
  -- One option per poll per date.
  UNIQUE (poll_id, game_date)
);

-- FK from polls.confirmed_option_id back to poll_options.id, added separately
-- to break the circular dependency at table-creation time.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'polls_confirmed_option_fk'
  ) THEN
    ALTER TABLE polls
      ADD CONSTRAINT polls_confirmed_option_fk
      FOREIGN KEY (confirmed_option_id) REFERENCES poll_options(id) ON DELETE SET NULL;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS rsvps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  poll_option_id UUID NOT NULL REFERENCES poll_options(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  response rsvp_response NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- One vote per user per option. Updates flip the response.
  UNIQUE (poll_option_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_rsvps_poll ON rsvps(poll_id);
CREATE INDEX IF NOT EXISTS idx_rsvps_user ON rsvps(user_id);

-- ---- TOUCH updated_at TRIGGERS ---------------------------------------------

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS polls_set_updated_at ON public.polls;
CREATE TRIGGER polls_set_updated_at
  BEFORE UPDATE ON public.polls
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS rsvps_set_updated_at ON public.rsvps;
CREATE TRIGGER rsvps_set_updated_at
  BEFORE UPDATE ON public.rsvps
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---- RLS -------------------------------------------------------------------
-- Reads: anyone (so the dashboard banner works for non-admins too).
-- Writes:
--   * polls / poll_options: admin only (checked via users.is_admin or the
--     hard-coded admin email). RLS enforces this in addition to the route
--     guard at /games/poll/new/layout.tsx.
--   * rsvps: any logged-in user can manage their own row.

ALTER TABLE polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE poll_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE rsvps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS polls_select ON polls;
DROP POLICY IF EXISTS polls_insert_admin ON polls;
DROP POLICY IF EXISTS polls_update_admin ON polls;
DROP POLICY IF EXISTS polls_delete_admin ON polls;

DROP POLICY IF EXISTS poll_options_select ON poll_options;
DROP POLICY IF EXISTS poll_options_write_admin ON poll_options;

DROP POLICY IF EXISTS rsvps_select ON rsvps;
DROP POLICY IF EXISTS rsvps_insert_self ON rsvps;
DROP POLICY IF EXISTS rsvps_update_self ON rsvps;
DROP POLICY IF EXISTS rsvps_delete_self ON rsvps;

-- Helper: is the calling auth.uid() an admin? Wrapped as a SQL function so
-- policies stay readable.
CREATE OR REPLACE FUNCTION public.current_user_is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_admin FROM public.users WHERE user_id = auth.uid()),
    false
  );
$$;

CREATE POLICY polls_select ON polls FOR SELECT USING (true);
CREATE POLICY polls_insert_admin ON polls FOR INSERT
  WITH CHECK (public.current_user_is_admin());
CREATE POLICY polls_update_admin ON polls FOR UPDATE
  USING (public.current_user_is_admin())
  WITH CHECK (public.current_user_is_admin());
CREATE POLICY polls_delete_admin ON polls FOR DELETE
  USING (public.current_user_is_admin());

CREATE POLICY poll_options_select ON poll_options FOR SELECT USING (true);
CREATE POLICY poll_options_write_admin ON poll_options FOR ALL
  USING (public.current_user_is_admin())
  WITH CHECK (public.current_user_is_admin());

CREATE POLICY rsvps_select ON rsvps FOR SELECT USING (true);
CREATE POLICY rsvps_insert_self ON rsvps FOR INSERT
  WITH CHECK (user_id = auth.uid());
CREATE POLICY rsvps_update_self ON rsvps FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
CREATE POLICY rsvps_delete_self ON rsvps FOR DELETE
  USING (user_id = auth.uid());
