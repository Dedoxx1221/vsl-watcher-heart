ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS current_position numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_playing boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS region text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS device_type text,
  ADD COLUMN IF NOT EXISTS utm_source text,
  ADD COLUMN IF NOT EXISTS utm_medium text,
  ADD COLUMN IF NOT EXISTS utm_campaign text,
  ADD COLUMN IF NOT EXISTS utm_content text,
  ADD COLUMN IF NOT EXISTS utm_term text;

CREATE INDEX IF NOT EXISTS sessions_live_video_seen_idx
  ON public.sessions(video_id, last_seen_at DESC);

CREATE OR REPLACE FUNCTION public.get_live_vsl_analytics(_video_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  res jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.videos WHERE id = _video_id AND owner_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not found';
  END IF;

  WITH live AS (
    SELECT id, video_id, viewer_id, campaign, referrer, last_seen_at,
      current_position, is_playing, country, region, city, device_type,
      utm_source, utm_medium, utm_campaign, utm_content, utm_term
    FROM public.sessions
    WHERE video_id = _video_id
      AND last_seen_at > now() - interval '35 seconds'
  ), geo AS (
    SELECT COALESCE(country, 'Desconhecido') AS country,
      COALESCE(region, '') AS region, COALESCE(city, '') AS city,
      count(*)::int AS viewers
    FROM live GROUP BY 1, 2, 3
  )
  SELECT jsonb_build_object(
    'active_count', (SELECT count(*) FROM live),
    'playing_count', (SELECT count(*) FROM live WHERE is_playing),
    'viewers', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'session_id', id, 'viewer_id', left(viewer_id, 8),
        'position', current_position, 'is_playing', is_playing,
        'last_seen_at', last_seen_at, 'country', country, 'region', region,
        'city', city, 'device_type', device_type, 'referrer', referrer,
        'utm_source', utm_source, 'utm_medium', utm_medium, 'utm_campaign', utm_campaign
      ) ORDER BY is_playing DESC, last_seen_at DESC) FROM live
    ), '[]'::jsonb),
    'geo', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'country', country, 'region', region, 'city', city, 'viewers', viewers
      ) ORDER BY viewers DESC) FROM geo
    ), '[]'::jsonb)
  ) INTO res;
  RETURN res;
END $$;

REVOKE ALL ON FUNCTION public.get_live_vsl_analytics(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_live_vsl_analytics(uuid) TO authenticated;
