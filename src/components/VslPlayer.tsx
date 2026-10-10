import { useEffect, useRef, useState } from "react";
import { VslTracker } from "@/lib/tracker";
import { parseSettings, type PlayerSettings } from "@/lib/player-settings";

export type PlayerVideo = { id: string; video_url: string; thumbnail_url: string | null; checkout_url: string | null; offer_time_seconds: number | null; player_settings?: unknown };

type W = Window & { fbq?: (...a: unknown[]) => void; gtag?: (...a: unknown[]) => void; dataLayer?: unknown[] };

function loadPixels(cfg: PlayerSettings) {
  const w = window as W;
  if (cfg.fbPixel && !w.fbq) {
    const q: unknown[][] = [];
    const f = (...a: unknown[]) => { q.push(a); };
    (f as unknown as { queue: unknown[][] }).queue = q;
    w.fbq = f;
    const s = document.createElement("script");
    s.async = true; s.src = "https://connect.facebook.net/en_US/fbevents.js";
    s.onload = () => { const real = w.fbq!; q.forEach((a) => real(...a)); };
    document.head.appendChild(s);
    w.fbq("init", cfg.fbPixel);
  }
  if (cfg.ga4 && !w.gtag) {
    w.dataLayer = w.dataLayer || [];
    // eslint-disable-next-line prefer-rest-params
    w.gtag = function () { w.dataLayer!.push(arguments); };
    const s = document.createElement("script");
    s.async = true; s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(cfg.ga4)}`;
    document.head.appendChild(s);
    w.gtag("js", new Date()); w.gtag("config", cfg.ga4);
  }
}
function fire(cfg: PlayerSettings, fb: string, ga: string) {
  if (!cfg.pixels) return;
  const w = window as W;
  if (cfg.fbPixel) w.fbq?.("track", fb);
  if (cfg.ga4) w.gtag?.("event", ga);
}

export function VslPlayer({ video, settings, preview = false, onAutoplayImageTransform }: { video: PlayerVideo; settings?: PlayerSettings; preview?: boolean; onAutoplayImageTransform?: (next: { x: number; y: number; size: number }) => void }) {
  const cfg = settings ?? parseSettings(video.player_settings);
  const [paused, setPaused] = useState(false);
  const [ended, setEnded] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [resumeAt, setResumeAt] = useState<number | null>(null);
  const [cur, setCur] = useState(0);
  const posKey = `vsl_pos_${video.id}`;
  const ref = useRef<HTMLVideoElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const imageDrag = useRef<{ mode: "move" | "resize"; startX: number; startY: number; x: number; y: number; size: number; width: number; height: number } | null>(null);
  const tracker = useRef<VslTracker | null>(null);
  const started = useRef(false);
  const resetting = useRef(false);
  const internalSeek = useRef(false);
  const maxWatched = useRef(0);
  const [overlay, setOverlay] = useState(true);
  const [bar, setBar] = useState(0);
  const [showCta, setShowCta] = useState(!!(preview && cfg.ctaAlways));
  const [query, setQuery] = useState("");
  const [autoplayImageRatio, setAutoplayImageRatio] = useState<number | null>(null);
  const [imageSelected, setImageSelected] = useState(false);
  const [imageMoving, setImageMoving] = useState(false);

  useEffect(() => {
    if (preview) { ref.current?.pause(); return; }
    const params = new URLSearchParams(window.location.search);
    let hostParams = params;
    try { hostParams = new URLSearchParams(window.top?.location.search ?? ""); } catch { /* cross-origin */ }
    if (cfg.trafficFilter && cfg.trafficParam && !params.get(cfg.trafficParam) && !hostParams.get(cfg.trafficParam)) {
      if (cfg.trafficRedirect) { window.top ? (window.top.location.href = cfg.trafficRedirect) : (window.location.href = cfg.trafficRedirect); }
      setBlocked(true);
      return;
    }
    if (cfg.resumePrompt) {
      const saved = Number(localStorage.getItem(posKey) || 0);
      if (saved > 10) setResumeAt(saved);
    }
    if (cfg.pixels) loadPixels(cfg);
    setQuery(window.location.search.replace(/^\?/, ""));
    const campaign = params.get("utm_campaign") || params.get("campaign") || params.get("src") || null;
    const t = new VslTracker(video.id, video.offer_time_seconds, campaign, `${window.location.origin}/api/public/track`);
    tracker.current = t;
    const leave = () => { if (started.current) t.onLeave(ref.current?.currentTime ?? 0); };
    const vis = () => { if (document.visibilityState === "hidden") t.flush(true); };
    window.addEventListener("pagehide", leave);
    document.addEventListener("visibilitychange", vis);
    if (cfg.autoplay) ref.current?.play().catch(() => {}); // muted preview, not tracked
    return () => { window.removeEventListener("pagehide", leave); document.removeEventListener("visibilitychange", vis); t.destroy(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video.id, video.offer_time_seconds, preview, cfg.autoplay]);

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
    setCur(t);
    if (Number.isFinite(v.duration) && v.duration > 0) {
      const p = Math.min(1, Math.max(0, t / v.duration));
      setBar((cfg.fastBar ? 1 - Math.pow(1 - p, Math.max(1, cfg.barAccel || 1)) : p) * 100);
    }
    if (started.current && !resetting.current) {
      maxWatched.current = Math.max(maxWatched.current, t);
      if (!preview && cfg.resumePrompt && Math.floor(t) % 5 === 0) localStorage.setItem(posKey, String(v.ended ? 0 : t));
    }
    if ((preview && cfg.ctaAlways) || (started.current && video.offer_time_seconds != null && t >= video.offer_time_seconds)) setShowCta(true);
  }

  async function start(at = 0) {
    setResumeAt(null);
    setEnded(false);
    if (resetting.current) return;
    const v = el();
    resetting.current = true;
    v.loop = false;
    v.pause();
    try {
      if (v.readyState === 0) {
        v.load();
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
      if (!preview) fire(cfg, "ViewContent", "vsl_play");
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
  const style = { "--pb": cfg.barColor, "--cta-bg": cfg.ctaColor, "--cta-fg": cfg.ctaTextColor, "--accent": cfg.accentColor } as React.CSSProperties;
  const hook = cfg.hooks && started.current ? cfg.hookList.find((h) => cur >= h.at && cur < h.at + h.dur) : undefined;

  if (blocked) return null;

  return (
    <div ref={wrap} style={style} className={"mx-auto w-full bg-background " + (cfg.aspect === "9:16" ? "max-w-[480px]" : "")}>
      {cfg.headline && cfg.headlineText && (
        <p className="px-3 py-3 text-center text-lg font-bold leading-snug" style={{ color: cfg.headlineColor }}>{cfg.headlineText}</p>
      )}
      <div className={"relative w-full overflow-hidden bg-background leading-none " + (cfg.rounded ? "rounded-xl" : "")}>
        <video
          ref={ref}
          src={video.video_url}
          autoPlay={!preview && cfg.autoplay}
          muted
          loop={!preview && cfg.autoplay}
          playsInline
          preload="metadata"
          fetchPriority="high"
          crossOrigin={cfg.captions && cfg.captionsUrl ? "anonymous" : undefined}
          poster={video.thumbnail_url ?? undefined}
          disablePictureInPicture
          controlsList="nodownload noplaybackrate noremoteplayback"
          className={"block h-auto w-full bg-background object-contain " + (cfg.aspect === "9:16" ? "aspect-[9/16]" : "aspect-video")}
          onClick={togglePause}
          onLoadedMetadata={() => { tracker.current?.setDuration(el().duration); update(); }}
          onDurationChange={update}
          onPlay={() => { T()?.onPlay(el().currentTime); const r = cfg.turbo ? cfg.turboSpeed || 1 : 1; if (el().playbackRate !== r) el().playbackRate = r; }}
          onPause={() => { if (!el().ended) T()?.onPause(el().currentTime); }}
          onEnded={() => { T()?.onEnded(el().currentTime); if (started.current) setEnded(true); update(); }}
          onSeeking={() => {
            const v = el();
            if (!cfg.blockSeek || !started.current || internalSeek.current || resetting.current) return;
            if (v.currentTime > maxWatched.current + 1) { internalSeek.current = true; v.currentTime = maxWatched.current; }
          }}
          onSeeked={() => { internalSeek.current = false; T()?.onTime(el().currentTime, el().playbackRate); update(); }}
          onRateChange={() => { const r = cfg.turbo ? cfg.turboSpeed || 1 : 1; if (cfg.lockSpeed && el().playbackRate !== r) el().playbackRate = r; }}
          onTimeUpdate={() => { T()?.onTime(el().currentTime, el().playbackRate); update(); }}
        >
          {cfg.captions && cfg.captionsUrl && <track kind="captions" src={cfg.captionsUrl} srcLang="pt" label="Legendas" default />}
        </video>
        {hook && (
          <div className="pointer-events-none absolute inset-x-3 top-3 z-[3] rounded-lg bg-background/80 px-4 py-2 text-center text-sm font-bold text-foreground">{hook.text}</div>
        )}
        {started.current && paused && cfg.allowPause && (
          <button
            onClick={togglePause}
            aria-label="Continuar vídeo"
            className={"absolute inset-0 z-[2] flex flex-col items-center justify-center gap-3 text-foreground " + (cfg.thumbSniper && cfg.thumbPauseUrl ? "bg-transparent" : "bg-background/60")}
          >
            {cfg.thumbSniper && cfg.thumbPauseUrl ? (
              <img src={cfg.thumbPauseUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
            ) : (
              <>
                <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-[var(--accent)] text-primary-foreground">
                  <svg viewBox="0 0 24 24" className="ml-1 h-8 w-8 fill-current"><path d="M8 5v14l11-7z" /></svg>
                </span>
                <span className="relative text-sm font-semibold">{cfg.pauseText}</span>
              </>
            )}
          </button>
        )}
        {ended && cfg.thumbSniper && cfg.thumbEndUrl && (
          <button onClick={() => start(0)} className="absolute inset-0 z-[2]"><img src={cfg.thumbEndUrl} alt="" className="h-full w-full object-cover" /></button>
        )}
        {overlay && resumeAt != null && (
          <div className="absolute inset-0 z-[4] flex flex-col items-center justify-center gap-3 bg-background/85 p-6 text-center">
            <p className="font-semibold">{cfg.resumeText}</p>
            <button onClick={() => start(resumeAt)} className="rounded-md bg-[var(--accent)] px-5 py-2.5 font-bold text-primary-foreground">Continuar assistindo</button>
            <button onClick={() => start(0)} className="text-sm text-muted-foreground underline">Começar do início</button>
          </div>
        )}
        {(preview ? cfg.autoplay : overlay) && (
          <div role="button" tabIndex={0} aria-label="Toque para ouvir" onClick={() => { if (!preview) start(0); }} onKeyDown={(e) => { if (!preview && (e.key === "Enter" || e.key === " ")) start(0); }} className="absolute inset-0 z-[2] flex flex-col items-center justify-center gap-3 bg-transparent">
            {cfg.autoplayText && <span className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-bold text-primary-foreground">{cfg.autoplayText}</span>}
            {(cfg.autoplayImage || video.thumbnail_url) && cfg.autoplay && (
              <div
                className={"absolute z-[4] max-w-none " + (preview && onAutoplayImageTransform ? (imageSelected ? "cursor-move" : "cursor-pointer") : "pointer-events-none")}
                onClick={(e) => { if (preview && onAutoplayImageTransform) { e.preventDefault(); e.stopPropagation(); setImageSelected(true); } }}
                onPointerDown={preview && onAutoplayImageTransform ? (e) => {
                  if ((e.target as HTMLElement).dataset.resizeHandle) return;
                  e.preventDefault(); e.stopPropagation(); setImageSelected(true); setImageMoving(true);
                  const box = ref.current?.getBoundingClientRect(); if (!box) return;
                  imageDrag.current = { mode: "move", startX: e.clientX, startY: e.clientY, x: cfg.autoplayImageX ?? 50, y: cfg.autoplayImageY ?? 50, size: cfg.autoplayImageSize ?? 70, width: box.width, height: box.height };
                  e.currentTarget.setPointerCapture(e.pointerId);
                } : undefined}
                onPointerMove={preview && onAutoplayImageTransform ? (e) => {
                  const d = imageDrag.current; if (!d || d.mode !== "move") return;
                  e.preventDefault(); e.stopPropagation();
                  const rawX = Math.min(100, Math.max(0, d.x + (e.clientX - d.startX) / d.width * 100));
                  const rawY = Math.min(100, Math.max(0, d.y + (e.clientY - d.startY) / d.height * 100));
                  const x = Math.abs(rawX - 50) <= 4 ? 50 : rawX;
                  const y = Math.abs(rawY - 50) <= 4 ? 50 : rawY;
                  onAutoplayImageTransform({ x, y, size: d.size });
                } : undefined}
                onPointerUp={() => { imageDrag.current = null; setImageMoving(false); }}
                onPointerCancel={() => { imageDrag.current = null; setImageMoving(false); }}
                style={{
                  left: `${Math.min(100, Math.max(0, cfg.autoplayImageX ?? 50))}%`,
                  top: `${Math.min(100, Math.max(0, cfg.autoplayImageY ?? 50))}%`,
                  transform: "translate(-50%, -50%)",
                  width: `${Math.min(Math.min(100, Math.max(15, cfg.autoplayImageSize ?? 70)), autoplayImageRatio && ref.current ? 95 * ref.current.clientHeight / Math.max(1, ref.current.clientWidth) * autoplayImageRatio : 100)}%`,
                  maxHeight: "95%",
                  aspectRatio: autoplayImageRatio ? String(autoplayImageRatio) : undefined,
                  touchAction: preview && onAutoplayImageTransform ? "none" : undefined,
                  outline: imageSelected && preview && onAutoplayImageTransform ? "1px solid #2589ff" : "none",
                  outlineOffset: "-1px",
                }}
              >
                <img
                  src={cfg.autoplayImage || video.thumbnail_url!}
                  alt="Toque para ouvir"
                  draggable={false}
                  onLoad={(e) => {
                    const image = e.currentTarget;
                    if (image.naturalWidth > 0 && image.naturalHeight > 0) setAutoplayImageRatio(image.naturalWidth / image.naturalHeight);
                  }}
                  className="block h-full w-full select-none object-contain"
                  style={{ pointerEvents: "none" }}
                />
                {preview && onAutoplayImageTransform && imageSelected && (
                  <>
                    {imageMoving && <>
                      <div className="pointer-events-none absolute left-1/2 top-[-100vh] h-[200vh] w-px bg-[#2589ff]/80" />
                      <div className="pointer-events-none absolute left-[-100vw] top-1/2 h-px w-[200vw] bg-[#2589ff]/80" />
                    </>}
                    {(["nw","n","ne","e","se","s","sw","w"] as const).map((handle) => {
                      const horizontal = handle.includes("e") ? 1 : handle.includes("w") ? -1 : 0;
                      const vertical = handle.includes("s") ? 1 : handle.includes("n") ? -1 : 0;
                      const cursor = horizontal && vertical ? (horizontal === vertical ? "nwse-resize" : "nesw-resize") : horizontal ? "ew-resize" : "ns-resize";
                      return <button
                        key={handle}
                        type="button"
                        data-resize-handle="true"
                        aria-label="Redimensionar imagem"
                        title="Arraste para redimensionar"
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                        onPointerDown={(e) => {
                          e.preventDefault(); e.stopPropagation(); setImageSelected(true); setImageMoving(false);
                          const box = ref.current?.getBoundingClientRect(); if (!box) return;
                          imageDrag.current = { mode: "resize", startX: e.clientX, startY: e.clientY, x: cfg.autoplayImageX ?? 50, y: cfg.autoplayImageY ?? 50, size: cfg.autoplayImageSize ?? 70, width: box.width, height: box.height };
                          e.currentTarget.setPointerCapture(e.pointerId);
                        }}
                        onPointerMove={(e) => {
                          const d = imageDrag.current; if (!d || d.mode !== "resize") return;
                          e.preventDefault(); e.stopPropagation();
                          const dx = (e.clientX - d.startX) / Math.max(1, d.width) * 100 * horizontal;
                          const dy = (e.clientY - d.startY) / Math.max(1, d.height) * 100 * vertical * (autoplayImageRatio || 1);
                          const delta = horizontal && vertical ? (dx + dy) / 2 : horizontal ? dx : dy;
                          onAutoplayImageTransform({ x: d.x, y: d.y, size: Math.min(100, Math.max(15, d.size + delta)) });
                        }}
                        onPointerUp={() => { imageDrag.current = null; }}
                        onPointerCancel={() => { imageDrag.current = null; }}
                        className="absolute z-[6] h-3.5 w-3.5 rounded-sm border-2 border-white bg-[#2589ff] shadow-md touch-none"
                        style={{
                          left: handle.includes("w") ? 0 : handle.includes("e") ? "100%" : "50%",
                          top: handle.includes("n") ? 0 : handle.includes("s") ? "100%" : "50%",
                          transform: "translate(-50%, -50%)",
                          cursor,
                        }}
                      />;
                    })}
                  </>
                )}
              </div>
            )}
            {!cfg.autoplay && (
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--accent)] text-primary-foreground">
                <svg viewBox="0 0 24 24" className="ml-1 h-8 w-8 fill-current"><path d="M8 5v14l11-7z" /></svg>
              </span>
            )}
          </div>
        )}
        {cfg.showBar && <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[3]">
          <div className="w-full overflow-hidden bg-player-track" style={{ height: cfg.barHeight }}>
            <div className="h-full bg-[var(--pb)] transition-[width] duration-150 ease-linear" style={{ width: `${bar}%` }} />
          </div>
        </div>}
      </div>
      {cfg.cta && showCta && checkoutHref && (
        <div className="overflow-hidden px-3 py-3 text-center">
          <a
            href={checkoutHref}
            target="_top"
            onClick={() => { T()?.onCheckout(el().currentTime); if (!preview) fire(cfg, "InitiateCheckout", "vsl_checkout"); }}
            className={`${cfg.ctaPulse ? "cta-pulse " : ""}block rounded-[7px] bg-[var(--cta-bg)] px-6 py-4 text-base font-bold leading-snug text-[var(--cta-fg)] no-underline sm:inline-block sm:text-lg`}
          >
            {cfg.ctaText}
          </a>
        </div>
      )}
    </div>
  );
}
