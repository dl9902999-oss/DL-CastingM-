-- 模具圖面附件；保留既有匿名／登入使用者共用存取模式。
BEGIN;
ALTER TABLE public.patterns
  ADD COLUMN IF NOT EXISTS drawings jsonb NOT NULL DEFAULT '[]'::jsonb;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('pattern-drawings', 'pattern-drawings', false, 10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS pattern_drawings_read ON storage.objects;
CREATE POLICY pattern_drawings_read ON storage.objects
  FOR SELECT TO anon, authenticated USING (bucket_id = 'pattern-drawings');
DROP POLICY IF EXISTS pattern_drawings_insert ON storage.objects;
CREATE POLICY pattern_drawings_insert ON storage.objects
  FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'pattern-drawings');
DROP POLICY IF EXISTS pattern_drawings_delete ON storage.objects;
CREATE POLICY pattern_drawings_delete ON storage.objects
  FOR DELETE TO anon, authenticated USING (bucket_id = 'pattern-drawings');
COMMIT;
