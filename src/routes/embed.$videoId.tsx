import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
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
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const previous = {
      htmlBackground: html.style.background,
      htmlBackgroundImage: html.style.backgroundImage,
      htmlOverflow: html.style.overflow,
      bodyBackground: body.style.background,
      bodyBackgroundImage: body.style.backgroundImage,
      bodyOverflow: body.style.overflow,
      bodyMargin: body.style.margin,
    };
    html.style.background = "transparent";
    html.style.backgroundImage = "none";
    html.style.overflow = "hidden";
    body.style.background = "transparent";
    body.style.backgroundImage = "none";
    body.style.overflow = "hidden";
    body.style.margin = "0";
    return () => {
      html.style.background = previous.htmlBackground;
      html.style.backgroundImage = previous.htmlBackgroundImage;
      html.style.overflow = previous.htmlOverflow;
      body.style.background = previous.bodyBackground;
      body.style.backgroundImage = previous.bodyBackgroundImage;
      body.style.overflow = previous.bodyOverflow;
      body.style.margin = previous.bodyMargin;
    };
  }, []);
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
  if (isLoading) return <div className="fixed inset-0 overflow-hidden bg-transparent" />;
  if (!video) return <div className="fixed inset-0 overflow-hidden bg-transparent p-6 text-muted-foreground">Vídeo não encontrado.</div>;
  return (
    <>
      <style>{`
        html, body, #root {
          background: transparent !important;
          background-color: transparent !important;
          background-image: none !important;
          box-shadow: none !important;
        }
        html, body {
          margin: 0 !important;
          padding: 0 !important;
          min-height: 0 !important;
          height: auto !important;
          overflow: hidden !important;
        }
        #root {
          width: 100% !important;
          min-height: 0 !important;
          height: auto !important;
          padding: 0 !important;
        }
        #vexora-embed-root,
        #vexora-embed-root > div,
        #vexora-embed-root .vexora-headline,
        #vexora-embed-root .vexora-headline * {
          background-color: transparent !important;
          background-image: none !important;
          box-shadow: none !important;
        }
        #vexora-embed-root .vexora-headline,
        #vexora-embed-root .vexora-headline *,
        #vexora-embed-root video {
          background: transparent !important;
          background-color: transparent !important;
          background-image: none !important;
          box-shadow: none !important;
        }
        #vexora-embed-root .vexora-headline {
          border: 0 !important;
          outline: 0 !important;
        }
      `}</style>
      <div
        id="vexora-embed-root"
        className="relative w-full min-w-0 max-w-full overflow-visible bg-transparent"
        style={{ background: "transparent", backgroundColor: "transparent", backgroundImage: "none", boxShadow: "none" }}
      >
        <VslPlayer video={video} />
      </div>
    </>
  );
}

