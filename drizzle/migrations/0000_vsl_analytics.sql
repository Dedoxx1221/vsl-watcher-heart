CREATE TABLE public.videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid,
  name text NOT NULL,
  video_url text NOT NULL,
  thumbnail_url text,
  checkout_url text,
  offer_time_seconds integer,
  duration_seconds numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.videos TO authenticated;
GRANT ALL ON public.videos TO service_role;
ALTER TABLE public.videos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own videos select" ON public.videos FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "own videos insert" ON public.videos FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "own videos update" ON public.videos FOR UPDATE TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "own videos delete" ON public.videos FOR DELETE TO authenticated USING (owner_id = auth.uid());

CREATE TABLE public.sessions (
  id uuid PRIMARY KEY,
  video_id uuid NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  viewer_id text NOT NULL,
  campaign text,
  referrer text,
  user_agent text,
  started_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  played boolean NOT NULL DEFAULT false,
  reached_offer boolean NOT NULL DEFAULT false,
  clicked_checkout boolean NOT NULL DEFAULT false,
  watched_seconds numeric NOT NULL DEFAULT 0,
  paused_seconds numeric NOT NULL DEFAULT 0,
  max_position numeric NOT NULL DEFAULT 0
);
CREATE INDEX ON public.sessions(video_id, started_at);
GRANT ALL ON public.sessions TO service_role;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.events (
  id bigserial PRIMARY KEY,
  client_event_id text NOT NULL UNIQUE,
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  video_id uuid NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  type text NOT NULL,
  position numeric NOT NULL DEFAULT 0,
  from_position numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.events(video_id, created_at);
GRANT ALL ON public.events TO service_role;
GRANT USAGE ON SEQUENCE public.events_id_seq TO service_role;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

-- Real (non-seeked) playback ranges per session
CREATE TABLE public.watch_ranges (
  id bigserial PRIMARY KEY,
  client_range_id text NOT NULL UNIQUE,
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  video_id uuid NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  start_s numeric NOT NULL,
  end_s numeric NOT NULL
);
CREATE INDEX ON public.watch_ranges(video_id, session_id);
GRANT ALL ON public.watch_ranges TO service_role;
GRANT USAGE ON SEQUENCE public.watch_ranges_id_seq TO service_role;
ALTER TABLE public.watch_ranges ENABLE ROW LEVEL SECURITY;

-- Seed current VSL (claimed by first account)
INSERT INTO public.videos (id, name, video_url, thumbnail_url, checkout_url, offer_time_seconds)
VALUES ('00000000-0000-4000-8000-000000000001', 'VSL Principal',
 'https://lrlgziuwdmyklpfedtvp.supabase.co/storage/v1/object/public/vsls/original%20(2).mp4',
 'https://lrlgziuwdmyklpfedtvp.supabase.co/storage/v1/object/public/vsls/6aa5f20fcca0875e43bf2fd5.png',
 'https://pay.hotmart.com/J107685948G?off=6ka91kv3&checkoutMode=10', 3705);

CREATE OR REPLACE FUNCTION public.claim_unowned_videos() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.videos SET owner_id = NEW.id WHERE owner_id IS NULL;
  RETURN NEW;
END $$;
CREATE TRIGGER on_auth_user_created_claim AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.claim_unowned_videos();

CREATE OR REPLACE FUNCTION public.get_video_analytics(_video_id uuid, _from timestamptz, _to timestamptz, _campaign text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v public.videos;
  dur numeric;
  bsize integer;
  res jsonb;
BEGIN
  SELECT * INTO v FROM public.videos WHERE id = _video_id AND owner_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'not found'; END IF;
  dur := COALESCE(v.duration_seconds, (SELECT max(end_s) FROM watch_ranges WHERE video_id=_video_id), 0);
  bsize := GREATEST(1, ceil(dur / 300.0)::int);

  WITH s AS (
    SELECT * FROM sessions WHERE video_id=_video_id AND started_at >= _from AND started_at < _to
      AND (_campaign IS NULL OR campaign = _campaign)
  ), ps AS (SELECT * FROM s WHERE played),
  b AS (SELECT g AS bucket FROM generate_series(0, GREATEST(0, floor(dur / bsize)::int)) g),
  ret AS (
    SELECT b.bucket, count(DISTINCT r.session_id) AS n
    FROM b LEFT JOIN watch_ranges r ON r.video_id=_video_id
      AND r.session_id IN (SELECT id FROM ps)
      AND r.start_s <= b.bucket*bsize + bsize/2.0 AND r.end_s >= b.bucket*bsize + bsize/2.0
    GROUP BY b.bucket ORDER BY b.bucket
  ),
  marks AS (
    SELECT p, (SELECT count(DISTINCT r.session_id) FROM watch_ranges r WHERE r.video_id=_video_id
      AND r.session_id IN (SELECT id FROM ps)
      AND r.start_s <= GREATEST(0, dur*p/100.0 - 1) AND r.end_s >= GREATEST(0, dur*p/100.0 - 1)) AS n
    FROM unnest(ARRAY[10,25,50,75,100]) p
  ),
  ev AS (
    SELECT type, count(*) n FROM events WHERE session_id IN (SELECT id FROM s) GROUP BY type
  ),
  daily AS (
    SELECT date_trunc('day', started_at)::date d, count(*) views, count(*) FILTER (WHERE played) plays,
      count(*) FILTER (WHERE clicked_checkout) clicks
    FROM s GROUP BY 1 ORDER BY 1
  )
  SELECT jsonb_build_object(
    'duration', dur, 'bucket_size', bsize,
    'views', (SELECT count(*) FROM s),
    'unique_viewers', (SELECT count(DISTINCT viewer_id) FROM s),
    'plays', (SELECT count(*) FROM ps),
    'unique_players', (SELECT count(DISTINCT viewer_id) FROM ps),
    'reached_offer', (SELECT count(*) FROM ps WHERE reached_offer),
    'clicked_checkout', (SELECT count(*) FROM ps WHERE clicked_checkout),
    'avg_watched', (SELECT COALESCE(avg(watched_seconds),0) FROM ps),
    'avg_paused', (SELECT COALESCE(avg(paused_seconds),0) FROM ps),
    'retention', (SELECT COALESCE(jsonb_agg(jsonb_build_array(bucket*bsize, n) ORDER BY bucket), '[]') FROM ret),
    'marks', (SELECT jsonb_object_agg(p::text, n) FROM marks),
    'events', (SELECT COALESCE(jsonb_object_agg(type, n), '{}') FROM ev),
    'daily', (SELECT COALESCE(jsonb_agg(jsonb_build_object('d', d, 'views', views, 'plays', plays, 'clicks', clicks)), '[]') FROM daily),
    'campaigns', (SELECT COALESCE(jsonb_agg(DISTINCT campaign) FILTER (WHERE campaign IS NOT NULL), '[]') FROM sessions WHERE video_id=_video_id)
  ) INTO res;
  RETURN res;
END $$;
REVOKE ALL ON FUNCTION public.get_video_analytics FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_video_analytics TO authenticated;