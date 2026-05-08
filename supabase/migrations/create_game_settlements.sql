-- ============================================================================
-- Game settlements table + RLS
-- ----------------------------------------------------------------------------
-- Tracks which players have been ticked off as paid for each game. Previously
-- this lived in the admin's localStorage, which meant non-admin players could
-- never see who'd paid. Storing it in Supabase makes the state shared:
--   * everyone reads (so non-admins see live "Paid" / "Owing" badges)
--   * only admins write (enforced by RLS — UI gating is defence-in-depth only)
--
-- Run this in your Supabase SQL Editor. Idempotent — safe to re-run.
-- ============================================================================

CREATE TABLE IF NOT EXISTS game_settlements (
  game_id     TEXT NOT NULL,
  player_key  TEXT NOT NULL, -- lower-cased player name, matches local-store convention
  player_name TEXT NOT NULL, -- original casing, for display / audit
  settled_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  settled_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  PRIMARY KEY (game_id, player_key)
);

CREATE INDEX IF NOT EXISTS idx_game_settlements_game ON game_settlements(game_id);

-- ----------------------------------------------------------------------------
-- Row Level Security
--   * SELECT: anyone can read (anonymous included — history pages render
--     server-side with the anon key before sign-in completes).
--   * INSERT / DELETE: only admins (users.is_admin = true). UPDATE isn't
--     needed — toggle = insert OR delete on the composite key.
-- ----------------------------------------------------------------------------
ALTER TABLE game_settlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "game_settlements_select_all" ON game_settlements;
DROP POLICY IF EXISTS "game_settlements_insert_admin" ON game_settlements;
DROP POLICY IF EXISTS "game_settlements_delete_admin" ON game_settlements;

CREATE POLICY "game_settlements_select_all"
  ON game_settlements FOR SELECT
  USING (true);

CREATE POLICY "game_settlements_insert_admin"
  ON game_settlements FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.user_id = auth.uid() AND u.is_admin = true
    )
  );

CREATE POLICY "game_settlements_delete_admin"
  ON game_settlements FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.user_id = auth.uid() AND u.is_admin = true
    )
  );
