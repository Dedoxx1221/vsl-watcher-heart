import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { VslPlayer } from "@/components/VslPlayer";

export const Route = createFileRoute("/embed/$videoId")({
  head: () => ({
    meta: [
      { title: "Player VSL" },
      { name: "description", content: "Player de VSL com métricas de retenção." },
      { property: "og:title", content: "Player VSL" },
      { property: "og:description", content: "Player de VSL com métricas de retenção." },
      { property: "og:type", content: "video.other" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Embed,
});

function Embed() {
  const { videoId } = Route.useParams();
  const { data: video, isLoading } = useQuery({
    queryKey: ["embed", videoId],
    queryFn: async () => {
      const { data } = await supabase
        .from("videos")
        .select("id, name, video_url, thumbnail_url, checkout_url, offer_time_seconds, player_settings")
        .eq("id", videoId)
        .maybeSingle();
      return data;
    },
  });
  if (isLoading) return <div className="aspect-video w-full bg-background" />;
  if (!video) return <div className="p-6 text-muted-foreground">Vídeo não encontrado.</div>;
  return <VslPlayer video={video} />;
}

