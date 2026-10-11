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
    // Force the embed document itself to be transparent, independent of the Vexora app theme.
    html.style.setProperty("background", "transparent", "important");
    html.style.setProperty("background-color", "transparent", "important");
    html.style.setProperty("background-image", "none", "important");
    html.style.overflow = "hidden";
    body.style.setProperty("background", "transparent", "important");
    body.style.setProperty("background-color", "transparent", "important");
    body.style.setProperty("background-image", "none", "important");
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
        :root, html, body, #root, body > #root {
          background: transparent !important;
          background-color: transparent !important;
          background-image: none !important;
          box-shadow: none !important;
        }
        html, body, #root, body > #root {
          background-color: rgba(0, 0, 0, 0) !important;
          background-image: none !important;
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
        /* Keep the embed canvas transparent; only media and actual controls may paint content. */
        #vexora-embed-root,
        #vexora-embed-root > div,
        #vexora-embed-root .vexora-headline,
        #vexora-embed-root video,
        #vexora-embed-root .vexora-headline > div {
          background: transparent !important;
          background-color: transparent !important;
          background-image: none !important;
          box-shadow: none !important;
        }
        html, body, #root, #vexora-embed-root {
          color-scheme: normal !important;
          background: transparent !important;
          background-color: transparent !important;
          background-image: none !important;
          box-shadow: none !important;
          border: 0 !important;
        }
        body { background-attachment: initial !important; }
        #vexora-embed-root .vexora-headline {
          border: 0 !important;
          outline: 0 !important;
        }
      `}</style>
      <div
        id="vexora-embed-root"
        className="relative w-full min-w-0 max-w-full overflow-visible"
        style={{ background: "transparent", backgroundColor: "transparent", backgroundImage: "none", boxShadow: "none" }}
      >
        <VslPlayer video={video} />
      </div>
    </>
  );
}
