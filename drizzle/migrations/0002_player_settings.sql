ALTER TABLE public.videos ADD COLUMN player_settings jsonb NOT NULL DEFAULT '{}'::jsonb;
GRANT SELECT (player_settings) ON public.videos TO anon;