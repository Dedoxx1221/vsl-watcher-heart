-- Reset all analytics rows atomically and only for a video owned by the caller.
CREATE OR REPLACE FUNCTION public.reset_video_metrics(_video_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.videos
    WHERE id = _video_id AND owner_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Video not found or access denied' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.watch_ranges WHERE video_id = _video_id;
  DELETE FROM public.events WHERE video_id = _video_id;
  DELETE FROM public.sessions WHERE video_id = _video_id;
END;
$$;

REVOKE ALL ON FUNCTION public.reset_video_metrics(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reset_video_metrics(uuid) TO authenticated;
