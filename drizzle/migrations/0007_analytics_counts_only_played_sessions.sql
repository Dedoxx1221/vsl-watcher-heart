ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS browser text;

-- Analytics breakdowns count sessions that actually played the video.
CREATE OR REPLACE FUNCTION public.get_video_analytics(_video_id uuid, _from timestamptz, _to timestamptz, _campaign text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v public.videos;
  dur numeric;
  bsize integer;
  res jsonb;
BEGIN
  SELECT * INTO v
  FROM public.videos
  WHERE id = _video_id AND owner_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not found';
  END IF;

  SELECT COALESCE(v.duration_seconds, (SELECT max(w.end_s) FROM public.watch_ranges w WHERE w.video_id = _video_id), 0)
    INTO dur;

  dur := GREATEST(COALESCE(dur, 0), 0);
  -- Keep the curve readable with at most roughly 300 regular points.
  bsize := GREATEST(1, ceil(GREATEST(dur, 1) / 300.0)::int);

  WITH RECURSIVE sessions_filtered AS MATERIALIZED (
    SELECT s.*
    FROM public.sessions s
    WHERE s.video_id = _video_id
      AND s.started_at >= _from AND s.started_at < _to
      AND (_campaign IS NULL OR s.campaign = _campaign)
  ),
  played_sessions AS MATERIALIZED (
    SELECT * FROM sessions_filtered WHERE played
  ),
  ranked_ranges AS (
    SELECT wr.session_id, wr.start_s, wr.end_s,
      row_number() OVER (PARTITION BY wr.session_id ORDER BY wr.start_s, wr.end_s) AS rn
    FROM public.watch_ranges wr
    JOIN played_sessions ps ON ps.id = wr.session_id
    WHERE wr.video_id = _video_id AND wr.end_s > wr.start_s
  ),
  continuous_reach(session_id, rn, reach_s) AS (
    SELECT session_id, rn, end_s
    FROM ranked_ranges
    WHERE rn = 1 AND start_s <= 2
    UNION ALL
    SELECT rr.session_id, rr.rn, GREATEST(cr.reach_s, rr.end_s)
    FROM continuous_reach cr
    JOIN ranked_ranges rr ON rr.session_id = cr.session_id
      AND rr.rn = cr.rn + 1
      AND rr.start_s <= cr.reach_s + 2
  ),
  max_continuous AS (
    SELECT session_id, max(reach_s) AS reached_s
    FROM continuous_reach
    GROUP BY session_id
  ),
  sample_times AS (
    SELECT (g * bsize)::numeric AS t
    FROM generate_series(0, floor(dur / bsize)::int) AS g
    UNION
    SELECT dur WHERE dur > 0
  ),
  retention_points AS (
    SELECT st.t,
      CASE WHEN st.t <= 0 THEN (SELECT count(*) FROM played_sessions)
      ELSE (
        SELECT count(*)
        FROM max_continuous mc
        WHERE mc.reached_s >= st.t
           OR (st.t >= dur - 2 AND mc.reached_s >= dur - 2)
      ) END::bigint AS viewers
    FROM sample_times st
  ),
  marks AS (
    SELECT p,
      CASE WHEN dur <= 0 THEN 0
      ELSE (SELECT count(*) FROM max_continuous mc
        WHERE mc.reached_s >= dur * p / 100.0
           OR (p = 100 AND mc.reached_s >= dur - 2))
      END AS n
    FROM unnest(ARRAY[10,25,50,75,100]) p
  ),
  event_counts AS (
    SELECT e.type, count(*)::bigint AS n
    FROM public.events e
    JOIN played_sessions sf ON sf.id = e.session_id
    GROUP BY e.type
  ),
  daily AS (
    SELECT date_trunc('day', sf.started_at)::date AS d,
      count(*) FILTER (WHERE sf.played)::bigint AS views,
      count(*) FILTER (WHERE sf.played)::bigint AS plays,
      count(*) FILTER (WHERE sf.clicked_checkout)::bigint AS clicks
    FROM sessions_filtered sf
    GROUP BY 1
  ),
  country_counts AS (
    SELECT COALESCE(NULLIF(sf.country, ''), 'Desconhecido') AS label, count(*)::bigint AS n
    FROM played_sessions sf GROUP BY 1
  ),
  device_counts AS (
    SELECT COALESCE(NULLIF(sf.device_type, ''), 'Desconhecido') AS label, count(*)::bigint AS n
    FROM played_sessions sf GROUP BY 1
  ),
  browser_counts AS (
    SELECT CASE
      WHEN sf.user_agent ILIKE '%Edg/%' THEN 'Microsoft Edge'
      WHEN sf.user_agent ILIKE '%OPR/%' OR sf.user_agent ILIKE '%Opera%' THEN 'Opera'
      WHEN sf.user_agent ILIKE '%Firefox/%' THEN 'Firefox'
      WHEN sf.user_agent ILIKE '%SamsungBrowser/%' THEN 'Samsung Internet'
      WHEN sf.user_agent ILIKE '%Chrome/%' THEN 'Chrome'
      WHEN sf.user_agent ILIKE '%Safari/%' THEN 'Safari'
      WHEN COALESCE(sf.user_agent, '') = '' THEN 'Desconhecido'
      ELSE 'Outro'
    END AS label, count(*)::bigint AS n
    FROM played_sessions sf GROUP BY 1
  ),
  source_counts AS (
    SELECT COALESCE(
      NULLIF(concat_ws(' / ', NULLIF(sf.utm_source,''), NULLIF(sf.utm_medium,''), NULLIF(sf.utm_campaign,'')), ''),
      NULLIF(sf.referrer, ''),
      'Direto / desconhecido'
    ) AS label, count(*)::bigint AS n
    FROM played_sessions sf GROUP BY 1
  )
  SELECT jsonb_build_object(
    'duration', dur,
    'bucket_size', bsize,
    -- Analytics "viewers" means a real VSL start, not a page/embed load.
    'views', (SELECT count(*) FROM played_sessions),
    'unique_viewers', (SELECT count(DISTINCT viewer_id) FROM played_sessions),
    'plays', (SELECT count(*) FROM played_sessions),
    'unique_players', (SELECT count(DISTINCT viewer_id) FROM played_sessions),
    'reached_offer', (SELECT count(*) FROM played_sessions WHERE reached_offer),
    'clicked_checkout', (SELECT count(*) FROM played_sessions WHERE clicked_checkout),
    'avg_watched', (SELECT COALESCE(avg(watched_seconds),0) FROM played_sessions),
    'avg_paused', (SELECT COALESCE(avg(paused_seconds),0) FROM played_sessions),
    'retention', COALESCE((SELECT jsonb_agg(jsonb_build_array(t, viewers) ORDER BY t) FROM retention_points), '[]'::jsonb),
    'marks', COALESCE((SELECT jsonb_object_agg(p::text, n) FROM marks), '{}'::jsonb),
    'events', COALESCE((SELECT jsonb_object_agg(type, n) FROM event_counts), '{}'::jsonb),
    'daily', COALESCE((SELECT jsonb_agg(jsonb_build_object('d', d, 'views', views, 'plays', plays, 'clicks', clicks) ORDER BY d) FROM daily), '[]'::jsonb),
    'campaigns', COALESCE((SELECT jsonb_agg(DISTINCT s.campaign) FILTER (WHERE s.campaign IS NOT NULL) FROM played_sessions s WHERE s.video_id = _video_id), '[]'::jsonb),
    'countries', COALESCE((SELECT jsonb_agg(jsonb_build_object('label', label, 'count', n) ORDER BY n DESC, label) FROM country_counts), '[]'::jsonb),
    'devices', COALESCE((SELECT jsonb_agg(jsonb_build_object('label', label, 'count', n) ORDER BY n DESC, label) FROM device_counts), '[]'::jsonb),
    'browsers', COALESCE((SELECT jsonb_agg(jsonb_build_object('label', label, 'count', n) ORDER BY n DESC, label) FROM browser_counts), '[]'::jsonb),
    'sources', COALESCE((SELECT jsonb_agg(jsonb_build_object('label', label, 'count', n) ORDER BY n DESC, label) FROM source_counts), '[]'::jsonb)
  ) INTO res;

  RETURN res;
END $$;

REVOKE ALL ON FUNCTION public.get_video_analytics(uuid, timestamptz, timestamptz, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_video_analytics(uuid, timestamptz, timestamptz, text) TO authenticated;


-- Include browser classification in live audience results.
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
      current_position, is_playing, country, region, city, device_type, user_agent,
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
        'city', city, 'device_type', device_type,
        'browser', CASE WHEN user_agent ILIKE '%Edg/%' THEN 'Microsoft Edge' WHEN user_agent ILIKE '%OPR/%' OR user_agent ILIKE '%Opera%' THEN 'Opera' WHEN user_agent ILIKE '%Firefox/%' THEN 'Firefox' WHEN user_agent ILIKE '%SamsungBrowser/%' THEN 'Samsung Internet' WHEN user_agent ILIKE '%Chrome/%' THEN 'Chrome' WHEN user_agent ILIKE '%Safari/%' THEN 'Safari' WHEN COALESCE(user_agent, '') = '' THEN NULL ELSE 'Outro' END,
        'referrer', referrer,
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
