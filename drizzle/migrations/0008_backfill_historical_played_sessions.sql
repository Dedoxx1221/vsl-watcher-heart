-- Backfill historical sessions that really started/watched the video but were
-- not marked played by older tracker versions. This restores valid historical
-- plays after analytics began filtering by sessions.played.
UPDATE public.sessions AS s
SET played = true
WHERE COALESCE(s.played, false) = false
  AND (
    COALESCE(s.watched_seconds, 0) > 0
    OR EXISTS (
      SELECT 1
      FROM public.events AS e
      WHERE e.session_id = s.id
        AND e.video_id = s.video_id
        AND e.type IN ('play', 'resume', 'complete', 'cta_reached', 'checkout_click')
    )
    OR EXISTS (
      SELECT 1
      FROM public.watch_ranges AS wr
      WHERE wr.session_id = s.id
        AND wr.video_id = s.video_id
        AND wr.end_s > wr.start_s
    )
  );
