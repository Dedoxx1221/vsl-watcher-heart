CREATE OR REPLACE FUNCTION public.reset_video_metrics(_video_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM videos WHERE id = _video_id AND owner_id = auth.uid()) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;
  DELETE FROM watch_ranges WHERE video_id = _video_id;
  DELETE FROM events WHERE video_id = _video_id;
  DELETE FROM sessions WHERE video_id = _video_id;
END $$;
REVOKE ALL ON FUNCTION public.reset_video_metrics(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reset_video_metrics(uuid) TO authenticated;