-- ============================================================================
-- Phase E.2 — Per-player photo tags
-- ----------------------------------------------------------------------------
-- Adds an optional player_name column to game_photos so each chip-stack
-- shot can be tagged with whose stack it is. The column is nullable —
-- untagged photos still work (food shots, scene-of-the-table, etc.).
--
-- Idempotent — safe to re-run.
-- ============================================================================

ALTER TABLE public.game_photos
  ADD COLUMN IF NOT EXISTS player_name TEXT;

-- Length cap mirrors the player_name limits elsewhere in the schema.
ALTER TABLE public.game_photos
  DROP CONSTRAINT IF EXISTS game_photos_player_name_length;
ALTER TABLE public.game_photos
  ADD CONSTRAINT game_photos_player_name_length CHECK (
    player_name IS NULL OR char_length(player_name) BETWEEN 1 AND 48
  );

CREATE INDEX IF NOT EXISTS idx_game_photos_player
  ON public.game_photos(game_id, player_name);
