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

const CTA_LABEL = "Accede a «La vida con mi ángel»";

function Player({ video }: { video: V }) {
  const ref = useRef<HTMLVideoElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const tracker = useRef<VslTracker | null>(null);
  const started = useRef(false);
  const resetting = useRef(false);
  const internalSeek = useRef(false);
  const maxWatched = useRef(0);
  const [overlay, setOverlay] = useState(true);
  const [bar, setBar] = useState(0);
  const [showCta, setShowCta] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setQuery(window.location.search.replace(/^\?/, ""));
    const campaign = params.get("utm_campaign") || params.get("campaign") || params.get("src") || null;
    const t = new VslTracker(video.id, video.offer_time_seconds, campaign, `${window.location.origin}/api/public/track`);
    tracker.current = t;
    const leave = () => { if (started.current) t.onLeave(ref.current?.currentTime ?? 0); };
    const vis = () => { if (document.visibilityState === "hidden") t.flush(true); };
    window.addEventListener("pagehide", leave);
    document.addEventListener("visibilitychange", vis);
    // Muted autoplay preview (not tracked as a play).
    ref.current?.play().catch(() => {});
    return () => { window.removeEventListener("pagehide", leave); document.removeEventListener("visibilitychange", vis); t.destroy(); };
  }, [video.id, video.offer_time_seconds]);

  // Report height to the host page so the iframe fits video + CTA.
  useEffect(() => {
    if (!wrap.current || window.parent === window) return;
    const ro = new ResizeObserver(() => window.parent.postMessage({ vslHeight: wrap.current!.offsetHeight }, "*"));
    ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);

  const el = () => ref.current!;
  const checkoutHref = video.checkout_url
    ? video.checkout_url + (query ? (video.checkout_url.includes("?") ? "&" : "?") + query : "")
    : null;

  function update() {
    const v = el();
    const t = v.currentTime || 0;
    if (Number.isFinite(v.duration) && v.duration > 0) {
      const p = Math.min(1, Math.max(0, t / v.duration));
      setBar((1 - Math.pow(1 - p, 32)) * 100); // fast start, slows down later
    }
    if (started.current && !resetting.current) maxWatched.current = Math.max(maxWatched.current, t);
    if (started.current && video.offer_time_seconds != null && t >= video.offer_time_seconds) setShowCta(true);
  }

  async function start() {
    if (resetting.current) return;
    const v = el();
    resetting.current = true;
    v.loop = false;
    v.pause();
    try {
      if (v.readyState === 0) {
        await new Promise((res, rej) => {
          v.addEventListener("loadedmetadata", res, { once: true });
          v.addEventListener("error", rej, { once: true });
        });
      }
      v.currentTime = 0;
      maxWatched.current = 0;
      setShowCta(false);
      v.muted = false;
      started.current = true;
      await v.play();
      setOverlay(false);
    } catch (err) {
      started.current = false;
      v.muted = true;
      setOverlay(true);
      console.error("Erro ao iniciar o vídeo:", err);
    } finally {
      resetting.current = false;
      update();
    }
  }

  const T = () => (started.current && !resetting.current ? tracker.current : null);

  return (
    <div ref={wrap} className="mx-auto w-full max-w-[480px] bg-background">
      <div className="relative w-full overflow-hidden bg-background leading-none">
        <video
          ref={ref}
          src={video.video_url}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          disablePictureInPicture
          controlsList="nodownload noplaybackrate noremoteplayback"
          className="block aspect-[9/16] h-auto w-full bg-background object-contain"
          onLoadedMetadata={() => { tracker.current?.setDuration(el().duration); update(); }}
          onDurationChange={update}
          onPlay={() => T()?.onPlay(el().currentTime)}
          onPause={() => { if (!el().ended) T()?.onPause(el().currentTime); }}
          onEnded={() => { T()?.onEnded(el().currentTime); update(); }}
          onSeeking={() => {
            const v = el();
            if (!started.current || internalSeek.current || resetting.current) return;
            if (v.currentTime > maxWatched.current + 1) { internalSeek.current = true; v.currentTime = maxWatched.current; }
          }}
          onSeeked={() => { internalSeek.current = false; T()?.onTime(el().currentTime, el().playbackRate); update(); }}
          onRateChange={() => { if (el().playbackRate !== 1) el().playbackRate = 1; }}
          onTimeUpdate={() => { T()?.onTime(el().currentTime, el().playbackRate); update(); }}
        />
        {overlay && (
          <button aria-label="Toca para escuchar" onClick={start} className="absolute inset-0 z-[2] flex items-center justify-center bg-transparent">
            {video.thumbnail_url && (
              <img src={video.thumbnail_url} alt="Toca para escuchar" className="pointer-events-none block h-auto max-h-[70%] w-[70%] max-w-[400px] object-contain" />
            )}
          </button>
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[3]">
          <div className="h-[5px] w-full overflow-hidden bg-player-track">
            <div className="h-full bg-player-bar transition-[width] duration-150 ease-linear" style={{ width: `${bar}%` }} />
          </div>
        </div>
      </div>
      {showCta && checkoutHref && (
        <div className="px-3 py-[22px] text-center">
          <a
            href={checkoutHref}
            target="_top"
            onClick={() => T()?.onCheckout(el().currentTime)}
            className="cta-pulse block rounded-[7px] bg-cta px-6 py-4 text-base font-bold leading-snug text-cta-foreground no-underline sm:inline-block sm:text-lg"
          >
            {CTA_LABEL}
          </a>
        </div>
      )}
    </div>
  );
}
