ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS country text, ADD COLUMN IF NOT EXISTS region text, ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS device_type text, ADD COLUMN IF NOT EXISTS utm_source text, ADD COLUMN IF NOT EXISTS utm_medium text,
  ADD COLUMN IF NOT EXISTS utm_campaign text, ADD COLUMN IF NOT EXISTS utm_content text, ADD COLUMN IF NOT EXISTS utm_term text,
  ADD COLUMN IF NOT EXISTS current_position numeric NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS is_playing boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.get_live_vsl_analytics(_video_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM videos WHERE id = _video_id AND owner_id = auth.uid()) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;
  WITH live AS (
    SELECT * FROM sessions WHERE video_id = _video_id AND last_seen_at > now() - interval '45 seconds'
  )
  SELECT jsonb_build_object(
    'active_count', (SELECT count(*) FROM live),
    'playing_count', (SELECT count(*) FROM live WHERE is_playing),
    'viewers', COALESCE((SELECT jsonb_agg(jsonb_build_object('session_id', id, 'viewer_id', viewer_id, 'position', current_position,
        'is_playing', is_playing, 'last_seen_at', last_seen_at, 'country', country, 'region', region, 'city', city,
        'device_type', device_type, 'referrer', referrer, 'utm_source', utm_source, 'utm_medium', utm_medium, 'utm_campaign', utm_campaign)
        ORDER BY last_seen_at DESC) FROM live), '[]'::jsonb),
    'geo', COALESCE((SELECT jsonb_agg(g) FROM (SELECT COALESCE(country,'—') country, COALESCE(region,'—') region, COALESCE(city,'—') city, count(*) viewers
        FROM live GROUP BY 1,2,3 ORDER BY 4 DESC) g), '[]'::jsonb)
  ) INTO r;
  RETURN r;
END $$;
REVOKE EXECUTE ON FUNCTION public.get_live_vsl_analytics(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_live_vsl_analytics(uuid) TO authenticated;