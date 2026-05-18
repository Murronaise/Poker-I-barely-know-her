-- ============================================================================
-- Phase C — Admin tooling tables
-- ----------------------------------------------------------------------------
-- Three new tables that work together to replace the localStorage-only
-- admin overlays with Supabase-backed records that sync across devices:
--   * deleted_games — overlay for "this hardcoded game is hidden from the
--     roster". The Effective-Games merger filters historicalGames against
--     this set on read.
--   * audit_log — append-only journal of admin actions (delete, restore,
--     edit, settle, etc.). Admin-only read so non-admins can't fingerprint
--     activity.
--   * player_aliases — admin tool: "this lowercase variant should display
--     as the canonical name". Used by the roster/profile renderers to
--     collapse "toby" + "Toby" into one entry.
--
-- Idempotent — safe to re-run. Run in Supabase SQL Editor.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. deleted_games
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.deleted_games (
  game_id    TEXT PRIMARY KEY,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reason     TEXT
);

ALTER TABLE public.deleted_games ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deleted_games_select_all" ON public.deleted_games;
DROP POLICY IF EXISTS "deleted_games_insert_admin" ON public.deleted_games;
DROP POLICY IF EXISTS "deleted_games_delete_admin" ON public.deleted_games;

-- Everyone (including anon) needs to read this set so the games index
-- filters out the deleted ones without a server round-trip.
CREATE POLICY "deleted_games_select_all"
  ON public.deleted_games FOR SELECT
  USING (true);

CREATE POLICY "deleted_games_insert_admin"
  ON public.deleted_games FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.user_id = auth.uid() AND u.is_admin = true
    )
  );

CREATE POLICY "deleted_games_delete_admin"
  ON public.deleted_games FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.user_id = auth.uid() AND u.is_admin = true
    )
  );

-- ---------------------------------------------------------------------------
-- 2. audit_log
-- ---------------------------------------------------------------------------
-- Append-only. `actor_name` is denormalised so audit rows survive when an
-- account is deleted. `details` is JSONB so each action type can carry its
-- own payload (e.g., a delete carries the reason, a settle carries the
-- player_key + amount).
CREATE TABLE IF NOT EXISTS public.audit_log (
  id          BIGSERIAL PRIMARY KEY,
  ts          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_name  TEXT,
  entity_type TEXT NOT NULL CHECK (entity_type IN (
    'game', 'settlement', 'player', 'note', 'alias'
  )),
  entity_id   TEXT NOT NULL,
  action      TEXT NOT NULL,
  details     JSONB
);

CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON public.audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_ts ON public.audit_log(ts DESC);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_log_select_admin" ON public.audit_log;
DROP POLICY IF EXISTS "audit_log_insert_authenticated" ON public.audit_log;

-- Admin-only read so non-admins can't fingerprint activity timing.
CREATE POLICY "audit_log_select_admin"
  ON public.audit_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.user_id = auth.uid() AND u.is_admin = true
    )
  );

-- Any authenticated user can append a row, but they must use their own
-- actor_id — preventing a malicious client from spoofing another user's
-- audit trail.
CREATE POLICY "audit_log_insert_authenticated"
  ON public.audit_log FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (actor_id IS NULL OR actor_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- 3. player_aliases
-- ---------------------------------------------------------------------------
-- Maps a lower-cased variant to the canonical display name. Renderers
-- look up via `alias_lower = lower(name)` and substitute canonical_name
-- when found.
CREATE TABLE IF NOT EXISTS public.player_aliases (
  alias_lower    TEXT PRIMARY KEY,
  canonical_name TEXT NOT NULL,
  created_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT player_aliases_canonical_length CHECK (char_length(canonical_name) BETWEEN 2 AND 24)
);

ALTER TABLE public.player_aliases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "player_aliases_select_all" ON public.player_aliases;
DROP POLICY IF EXISTS "player_aliases_insert_admin" ON public.player_aliases;
DROP POLICY IF EXISTS "player_aliases_delete_admin" ON public.player_aliases;

CREATE POLICY "player_aliases_select_all"
  ON public.player_aliases FOR SELECT
  USING (true);

CREATE POLICY "player_aliases_insert_admin"
  ON public.player_aliases FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.user_id = auth.uid() AND u.is_admin = true
    )
  );

CREATE POLICY "player_aliases_delete_admin"
  ON public.player_aliases FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.user_id = auth.uid() AND u.is_admin = true
    )
  );
