-- ============================================================================
-- Phase E — Media (chip-stack photos)
-- ----------------------------------------------------------------------------
-- Adds a `game-photos` storage bucket + a `game_photos` table that links
-- bucket objects to specific games. Reusing the avatars bucket would have
-- been simpler but would conflate two different RLS surfaces — photos are
-- not avatars, so they get their own bucket and policies.
--
-- Idempotent — safe to re-run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Storage bucket
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
  VALUES ('game-photos', 'game-photos', true)
  ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Storage object policies — mirror the avatars bucket model.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "game_photos_public_read" ON storage.objects';
  EXECUTE 'DROP POLICY IF EXISTS "game_photos_authed_insert" ON storage.objects';
  EXECUTE 'DROP POLICY IF EXISTS "game_photos_authed_delete" ON storage.objects';

  EXECUTE $POL$
    CREATE POLICY "game_photos_public_read"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'game-photos')
  $POL$;

  EXECUTE $POL$
    CREATE POLICY "game_photos_authed_insert"
      ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'game-photos')
  $POL$;

  EXECUTE $POL$
    CREATE POLICY "game_photos_authed_delete"
      ON storage.objects FOR DELETE TO authenticated
      USING (bucket_id = 'game-photos')
  $POL$;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Index table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.game_photos (
  id           BIGSERIAL PRIMARY KEY,
  game_id      TEXT NOT NULL,
  storage_path TEXT NOT NULL UNIQUE,
  caption      TEXT,
  uploaded_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  uploaded_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT game_photos_caption_length CHECK (caption IS NULL OR char_length(caption) <= 280)
);

CREATE INDEX IF NOT EXISTS idx_game_photos_game ON public.game_photos(game_id);
CREATE INDEX IF NOT EXISTS idx_game_photos_uploaded_at ON public.game_photos(uploaded_at DESC);

ALTER TABLE public.game_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "game_photos_select_all" ON public.game_photos;
DROP POLICY IF EXISTS "game_photos_insert_authenticated" ON public.game_photos;
DROP POLICY IF EXISTS "game_photos_delete_owner_or_admin" ON public.game_photos;

-- Everyone reads (history pages render server-side under the anon key).
CREATE POLICY "game_photos_select_all"
  ON public.game_photos FOR SELECT
  USING (true);

-- Any signed-in user can attach a photo. The actor's user_id must match
-- auth.uid() so a malicious client can't spoof attribution.
CREATE POLICY "game_photos_insert_authenticated"
  ON public.game_photos FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (uploaded_by IS NULL OR uploaded_by = auth.uid())
  );

-- Original uploader or an admin can delete. We don't expose UPDATE — a
-- photo is immutable; to change the caption, delete + reupload.
CREATE POLICY "game_photos_delete_owner_or_admin"
  ON public.game_photos FOR DELETE
  USING (
    uploaded_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.user_id = auth.uid() AND u.is_admin = true
    )
  );
