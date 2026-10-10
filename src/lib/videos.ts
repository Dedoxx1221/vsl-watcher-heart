import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const videosQuery = queryOptions({
  queryKey: ["videos"],
  queryFn: async () => {
    const { data, error } = await supabase.from("videos").select("*").order("created_at");
    if (error) throw error;
    return data;
  },
});

export type Analytics = {
  duration: number; bucket_size: number; views: number; unique_viewers: number; plays: number;
  unique_players: number; reached_offer: number; clicked_checkout: number; avg_watched: number;
  avg_paused: number; retention: [number, number][]; marks: Record<string, number>;
  events: Record<string, number>; daily: { d: string; views: number; plays: number; clicks: number }[];
  campaigns: string[];
};

export function fmtTime(s: number) {
  s = Math.max(0, Math.round(s));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const p = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${p(m)}:${p(sec)}` : `${p(m)}:${p(sec)}`;
}

export function pct(n: number, d: number) {
  return d ? (n / d) * 100 : 0;
}
