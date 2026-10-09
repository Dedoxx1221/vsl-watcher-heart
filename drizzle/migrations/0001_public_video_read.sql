GRANT SELECT (id, name, video_url, thumbnail_url, checkout_url, offer_time_seconds) ON public.videos TO anon;
CREATE POLICY "public embed read" ON public.videos FOR SELECT TO anon USING (true);