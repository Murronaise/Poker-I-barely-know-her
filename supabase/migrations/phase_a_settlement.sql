-- ============================================================================
-- Phase A — Settlement upgrades
-- ----------------------------------------------------------------------------
-- Three coordinated changes that ship together:
--   1. Payment handles on `users` — Revolut / Monzo / PayPal usernames so
--      settlement rows can render one-tap deep-links to the right provider.
--   2. `game_notes` table — admin-only private notes per game (context,
--      disputes, oddities worth remembering). The previous "edit game" flow
--      was localStorage-only; notes go straight to Supabase so they survive
--      browser switches and reach the admin no matter which device they're
--      on.
--   3. (No schema change for "mark paid + actor / timestamp" — the existing
--      `game_settlements` table already stores `settled_at` and `settled_by`;
--      we just surface them in the UI in this phase.)
--
-- Idempotent — safe to re-run. Run in Supabase SQL Editor.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Payment handles on `users`
-- ---------------------------------------------------------------------------
-- Three nullable text columns rather than a single JSON blob so we can
-- validate / index later if we need to. Store the handle only (no URL) —
-- the renderer reconstructs the deep link with the right host + amount.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS revolut_handle TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS monzo_handle   TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS paypal_handle  TEXT;

-- Length cap so a fat-finger paste of someone's full bank export doesn't
-- end up persisted. 48 chars covers every real-world username comfortably.
ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_payment_handles_length;
ALTER TABLE public.users
  ADD CONSTRAINT users_payment_handles_length CHECK (
    (revolut_handle IS NULL OR char_length(revolut_handle) BETWEEN 1 AND 48)
    AND (monzo_handle IS NULL OR char_length(monzo_handle) BETWEEN 1 AND 48)
    AND (paypal_handle IS NULL OR char_length(paypal_handle) BETWEEN 1 AND 48)
  );

-- The existing users_update_own_non_admin_fields RLS policy already lets a
-- user UPDATE their own row, so these columns are write-protected per-user
-- without any new policy. Re-state the policy anyway so a re-run of this
-- migration on top of an older schema picks up the handle columns too.
DROP POLICY IF EXISTS "users_update_own_non_admin_fields" ON public.users;
CREATE POLICY "users_update_own_non_admin_fields"
  ON public.users FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND is_admin = (SELECT u.is_admin FROM public.users u WHERE u.user_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- 2. Admin-only per-game notes
-- ---------------------------------------------------------------------------
-- One row per game. Notes are admin-only: SELECT, INSERT, UPDATE, DELETE
-- all require is_admin. Non-admins literally can't tell whether a row
-- exists for a game (RLS evaluates per-row before returning anything).
CREATE TABLE IF NOT EXISTS public.game_notes (
  game_id    TEXT PRIMARY KEY,
  note       TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT game_notes_note_length CHECK (char_length(note) <= 4000)
);

CREATE OR REPLACE FUNCTION public.touch_game_notes_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS game_notes_set_updated_at ON public.game_notes;
CREATE TRIGGER game_notes_set_updated_at
  BEFORE UPDATE ON public.game_notes
  FOR EACH ROW EXECUTE FUNCTION public.touch_game_notes_updated_at();

ALTER TABLE public.game_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "game_notes_select_admin" ON public.game_notes;
DROP POLICY IF EXISTS "game_notes_insert_admin" ON public.game_notes;
DROP POLICY IF EXISTS "game_notes_update_admin" ON public.game_notes;
DROP POLICY IF EXISTS "game_notes_delete_admin" ON public.game_notes;

CREATE POLICY "game_notes_select_admin"
  ON public.game_notes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.user_id = auth.uid() AND u.is_admin = true
    )
  );

CREATE POLICY "game_notes_insert_admin"
  ON public.game_notes FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.user_id = auth.uid() AND u.is_admin = true
    )
  );

CREATE POLICY "game_notes_update_admin"
  ON public.game_notes FOR UPDATE
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

CREATE POLICY "game_notes_delete_admin"
  ON public.game_notes FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.user_id = auth.uid() AND u.is_admin = true
    )
  );
