-- ============================================================================
-- Site visits table + RLS
-- ----------------------------------------------------------------------------
-- One row per page load (rate-limited client-side to one row per visitor per
-- minute per path). Captures both signed-in users (via user_id/email/
-- player_name) and anonymous traffic (via visitor_key, a stable cookie set
-- by the middleware). Used by the admin "Site Activity" panel.
--
-- Run this in the Supabase SQL Editor. Idempotent.
-- ============================================================================

CREATE TABLE IF NOT EXISTS site_visits (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_key  TEXT NOT NULL,         -- "u:<auth.uid>" for signed-in, "a:<cookie-uuid>" for anon
  user_id      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  email        TEXT,
  player_name  TEXT,
  path         TEXT NOT NULL,
  user_agent   TEXT,
  referer      TEXT,
  visited_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_site_visits_visited_desc ON site_visits(visited_at DESC);
CREATE INDEX IF NOT EXISTS idx_site_visits_visitor      ON site_visits(visitor_key, visited_at DESC);

-- ----------------------------------------------------------------------------
-- Row Level Security
--   * SELECT: admins only (the public has no business reading this).
--   * INSERT: anyone (anon included). The path is the only meaningful payload
--     and the row identifies the visitor by cookie/user_id, not by something
--     a client can spoof to impersonate someone else's visit history.
--   * UPDATE / DELETE: admins only (cleanup utility).
-- ----------------------------------------------------------------------------
ALTER TABLE site_visits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "site_visits_select_admin" ON site_visits;
DROP POLICY IF EXISTS "site_visits_insert_any"   ON site_visits;
DROP POLICY IF EXISTS "site_visits_delete_admin" ON site_visits;

CREATE POLICY "site_visits_select_admin"
  ON site_visits FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.user_id = auth.uid() AND u.is_admin = true
    )
  );

CREATE POLICY "site_visits_insert_any"
  ON site_visits FOR INSERT
  WITH CHECK (true);

CREATE POLICY "site_visits_delete_admin"
  ON site_visits FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.user_id = auth.uid() AND u.is_admin = true
    )
  );
