import { useEffect, useRef, useState } from "react";
import { VslTracker } from "@/lib/tracker";
import { parseSettings, type PlayerSettings } from "@/lib/player-settings";

export type PlayerVideo = { id: string; video_url: string; thumbnail_url: string | null; checkout_url: string | null; offer_time_seconds: number | null; player_settings?: unknown };

export function VslPlayer({ video, settings, preview = false }: { video: PlayerVideo; settings?: PlayerSettings; preview?: boolean }) {
  const cfg = settings ?? parseSettings(video.player_settings);
  const [paused, setPaused] = useState(false);
  const [resumeAt, setResumeAt] = useState<number | null>(null);
  const posKey = `vsl_pos_${video.id}`;
  const ref = useRef<HTMLVideoElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const tracker = useRef<VslTracker | null>(null);
  const started = useRef(false);
  const resetting = useRef(false);
  const internalSeek = useRef(false);
  const maxWatched = useRef(0);
  const [overlay, setOverlay] = useState(true);
  const [bar, setBar] = useState(0);
  const [showCta, setShowCta] = useState(!!(preview && cfg.ctaAlways));
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (preview) { ref.current?.play().catch(() => {}); return; }
    if (cfg.resumePrompt) {
      const saved = Number(localStorage.getItem(posKey) || 0);
      if (saved > 10) setResumeAt(saved);
    }
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video.id, video.offer_time_seconds, preview]);

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
      setBar((cfg.fastBar ? 1 - Math.pow(1 - p, 32) : p) * 100); // fast mode: quick start, slows later
    }
    if (started.current && !resetting.current) {
      maxWatched.current = Math.max(maxWatched.current, t);
      if (!preview && cfg.resumePrompt && Math.floor(t) % 5 === 0) localStorage.setItem(posKey, String(v.ended ? 0 : t));
    }
    if ((preview && cfg.ctaAlways) || (started.current && video.offer_time_seconds != null && t >= video.offer_time_seconds)) setShowCta(true);
  }

  async function start(at = 0) {
    setResumeAt(null);
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
      v.currentTime = at;
      maxWatched.current = at;
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

  const T = () => (!preview && started.current && !resetting.current ? tracker.current : null);
  function togglePause() {
    if (!started.current || !cfg.allowPause) return;
    const v = el();
    if (v.paused) { v.play(); setPaused(false); } else { v.pause(); setPaused(true); }
  }
  const style = { "--pb": cfg.barColor, "--cta-bg": cfg.ctaColor, "--cta-fg": cfg.ctaTextColor } as React.CSSProperties;

  return (
    <div ref={wrap} style={style} className={"mx-auto w-full bg-background " + (cfg.aspect === "9:16" ? "max-w-[480px]" : "")}>
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
          className={"block h-auto w-full bg-background object-contain " + (cfg.aspect === "9:16" ? "aspect-[9/16]" : "aspect-video")}
          onClick={togglePause}
          onLoadedMetadata={() => { tracker.current?.setDuration(el().duration); update(); }}
          onDurationChange={update}
          onPlay={() => T()?.onPlay(el().currentTime)}
          onPause={() => { if (!el().ended) T()?.onPause(el().currentTime); }}
          onEnded={() => { T()?.onEnded(el().currentTime); update(); }}
          onSeeking={() => {
            const v = el();
            if (!cfg.blockSeek || !started.current || internalSeek.current || resetting.current) return;
            if (v.currentTime > maxWatched.current + 1) { internalSeek.current = true; v.currentTime = maxWatched.current; }
          }}
          onSeeked={() => { internalSeek.current = false; T()?.onTime(el().currentTime, el().playbackRate); update(); }}
          onRateChange={() => { if (el().playbackRate !== 1) el().playbackRate = 1; }}
          onTimeUpdate={() => { T()?.onTime(el().currentTime, el().playbackRate); update(); }}
        />
        {started.current && paused && cfg.allowPause && (
          <button onClick={togglePause} className="absolute inset-0 z-[2] flex flex-col items-center justify-center gap-3 bg-background/60 text-foreground">
            <span className="flex h-16 w-16 items-center justify-center rounded-full player-accent">
              <svg viewBox="0 0 24 24" className="ml-1 h-8 w-8 fill-current"><path d="M8 5v14l11-7z" /></svg>
            </span>
            <span className="text-sm font-semibold">{cfg.pauseText}</span>
          </button>
        )}
        {overlay && resumeAt != null && (
          <div className="absolute inset-0 z-[4] flex flex-col items-center justify-center gap-3 bg-background/85 p-6 text-center">
            <p className="font-semibold">{cfg.resumeText}</p>
            <button onClick={() => start(resumeAt)} className="rounded-md px-5 py-2.5 font-bold player-accent">Continuar assistindo</button>
            <button onClick={() => start(0)} className="text-sm text-muted-foreground underline">Começar do início</button>
          </div>
        )}
        {overlay && (
          <button aria-label="Toca para escuchar" onClick={() => start(0)} className="absolute inset-0 z-[2] flex items-center justify-center bg-transparent">
            {video.thumbnail_url && (
              <img src={video.thumbnail_url} alt="Toca para escuchar" className="pointer-events-none block h-auto max-h-[70%] w-[70%] max-w-[400px] object-contain" />
            )}
          </button>
        )}
        {cfg.showBar && <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[3]">
          <div className="h-[5px] w-full overflow-hidden bg-player-track">
            <div className="h-full bg-[var(--pb)] transition-[width] duration-150 ease-linear" style={{ width: `${bar}%` }} />
          </div>
        </div>}
      </div>
      {showCta && checkoutHref && (
        <div className="px-3 py-[22px] text-center">
          <a
            href={checkoutHref}
            target="_top"
            onClick={() => T()?.onCheckout(el().currentTime)}
            className={`${cfg.ctaPulse ? "cta-pulse " : ""}block rounded-[7px] bg-[var(--cta-bg)] px-6 py-4 text-base font-bold leading-snug text-[var(--cta-fg)] no-underline sm:inline-block sm:text-lg`}
          >
            {cfg.ctaText}
          </a>
        </div>
      )}
    </div>
  );
}
