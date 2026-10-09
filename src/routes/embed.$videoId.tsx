import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { VslTracker } from "@/lib/tracker";

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
        .select("id, name, video_url, thumbnail_url, checkout_url, offer_time_seconds")
        .eq("id", videoId)
        .maybeSingle();
      return data;
    },
  });
  if (isLoading) return <div className="aspect-video w-full bg-background" />;
  if (!video) return <div className="p-6 text-muted-foreground">Vídeo não encontrado.</div>;
  return <Player video={video} />;
}

type V = { id: string; video_url: string; thumbnail_url: string | null; checkout_url: string | null; offer_time_seconds: number | null };

function Player({ video }: { video: V }) {
  const ref = useRef<HTMLVideoElement>(null);
  const tracker = useRef<VslTracker | null>(null);
  const [started, setStarted] = useState(false);
  const [showCta, setShowCta] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setQuery(window.location.search.replace(/^\?/, ""));
    const campaign = params.get("utm_campaign") || params.get("campaign") || params.get("src") || null;
    const t = new VslTracker(video.id, video.offer_time_seconds, campaign, `${window.location.origin}/api/public/track`);
    tracker.current = t;
    const leave = () => t.onLeave(ref.current?.currentTime ?? 0);
    const vis = () => { if (document.visibilityState === "hidden") t.flush(true); };
    window.addEventListener("pagehide", leave);
    document.addEventListener("visibilitychange", vis);
    return () => { window.removeEventListener("pagehide", leave); document.removeEventListener("visibilitychange", vis); t.destroy(); };
  }, [video.id, video.offer_time_seconds]);

  const el = () => ref.current!;
  const checkoutHref = video.checkout_url
    ? video.checkout_url + (query ? (video.checkout_url.includes("?") ? "&" : "?") + query : "")
    : null;

  return (
    <div className="relative aspect-video w-full overflow-hidden bg-background">
      <video
        ref={ref}
        src={video.video_url}
        poster={video.thumbnail_url ?? undefined}
        playsInline
        controls={started}
        preload="metadata"
        className="h-full w-full"
        onLoadedMetadata={() => tracker.current?.setDuration(el().duration)}
        onPlay={() => tracker.current?.onPlay(el().currentTime)}
        onPause={() => { if (!el().ended) tracker.current?.onPause(el().currentTime); }}
        onEnded={() => tracker.current?.onEnded(el().currentTime)}
        onSeeked={() => { tracker.current?.onTime(el().currentTime, el().playbackRate); }}
        onTimeUpdate={() => {
          const v = el();
          tracker.current?.onTime(v.currentTime, v.playbackRate);
          if (video.offer_time_seconds != null && v.currentTime >= video.offer_time_seconds) setShowCta(true);
        }}
      />
      {!started && (
        <button
          aria-label="Assistir"
          onClick={() => { setStarted(true); el().play(); }}
          className="absolute inset-0 flex items-center justify-center bg-background/30"
        >
          <span className="flex h-20 w-20 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-2xl">
            <svg viewBox="0 0 24 24" className="ml-1 h-9 w-9 fill-current"><path d="M8 5v14l11-7z" /></svg>
          </span>
        </button>
      )}
      {showCta && checkoutHref && (
        <a
          href={checkoutHref}
          target="_top"
          onClick={() => tracker.current?.onCheckout(el().currentTime)}
          className="absolute bottom-16 left-1/2 -translate-x-1/2 animate-in fade-in zoom-in rounded-lg bg-primary px-8 py-4 text-lg font-bold text-primary-foreground shadow-2xl"
        >
          QUERO GARANTIR AGORA
        </a>
      )}
    </div>
  );
}
