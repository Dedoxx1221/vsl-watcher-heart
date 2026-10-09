// Client-side VSL event tracker. Counts only real playback (no seek jumps).
type Ev = { id: string; type: string; position: number; from?: number | null };
type Range = { id: string; start: number; end: number };

type Persisted = {
  id: string; last: number; watched: number; paused: number; max: number;
  seq: number; ctaFired: boolean; completeFired: boolean;
};

const uid = () => crypto.randomUUID();
const r2 = (n: number) => Math.round(n * 100) / 100;

function viewerId() {
  try {
    let v = localStorage.getItem("vsl_viewer");
    if (!v) { v = uid(); localStorage.setItem("vsl_viewer", v); }
    return v;
  } catch { return uid(); }
}

export class VslTracker {
  private s: Persisted;
  private key: string;
  private queue: Ev[] = [];
  private openRange: Range | null = null;
  private dirtyRanges = new Map<string, Range>();
  private lastTime = 0;
  private playing = false;
  private pausedAt: number | null = null;
  private duration: number | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private hasPlayed = false;

  constructor(private videoId: string, private offerAt: number | null, private campaign: string | null, private endpoint: string) {
    this.key = `vsl_session_${videoId}`;
    let p: Persisted | null = null;
    try { p = JSON.parse(sessionStorage.getItem(this.key) || "null"); } catch { /* noop */ }
    // Reuse the session after a reload if active in the last 30 minutes.
    if (!p || Date.now() - p.last > 30 * 60 * 1000) {
      p = { id: uid(), last: Date.now(), watched: 0, paused: 0, max: 0, seq: 0, ctaFired: false, completeFired: false };
      this.push("load", 0);
    }
    this.s = p;
    this.hasPlayed = p.watched > 0;
    this.save();
    this.timer = setInterval(() => this.flush(), 5000);
  }

  private save() {
    this.s.last = Date.now();
    try { sessionStorage.setItem(this.key, JSON.stringify(this.s)); } catch { /* noop */ }
  }
  private push(type: string, position: number, from?: number) {
    this.queue.push({ id: uid(), type, position: r2(position), from: from != null ? r2(from) : null });
  }
  private closeRange() {
    if (this.openRange) this.dirtyRanges.set(this.openRange.id, { ...this.openRange });
    this.openRange = null;
  }

  setDuration(d: number) { if (isFinite(d) && d > 0) this.duration = r2(d); }

  onPlay(t: number) {
    if (this.pausedAt != null) {
      this.s.paused += (Date.now() - this.pausedAt) / 1000;
      this.pausedAt = null;
      this.push("resume", t);
    } else if (!this.hasPlayed) {
      this.push("play", t);
      this.hasPlayed = true;
    } else {
      this.push("resume", t);
    }
    this.playing = true;
    this.lastTime = t;
    this.save();
    this.flush();
  }

  onPause(t: number, ended = false) {
    if (!this.playing) return;
    this.playing = false;
    this.closeRange();
    if (!ended) { this.pausedAt = Date.now(); this.push("pause", t); }
    this.flush();
  }

  onSeeked(from: number, to: number) {
    this.closeRange();
    if (Math.abs(to - from) < 0.5) return;
    this.push(to > from ? "seek_forward" : "seek_backward", to, from);
    this.lastTime = to;
  }

  onTime(t: number, rate: number) {
    if (!this.playing) { this.lastTime = t; return; }
    const delta = t - this.lastTime;
    // Natural progression only: small forward steps proportional to playback rate.
    if (delta > 0 && delta <= 1.5 * Math.max(1, rate) + 0.5) {
      if (!this.openRange) {
        this.s.seq += 1;
        this.openRange = { id: `${this.s.id}-${this.s.seq}`, start: r2(this.lastTime), end: r2(t) };
      } else this.openRange.end = r2(t);
      this.dirtyRanges.set(this.openRange.id, { ...this.openRange });
      this.s.watched += delta;
      if (t > this.s.max) this.s.max = t;
      if (this.offerAt != null && !this.s.ctaFired && t >= this.offerAt) {
        this.s.ctaFired = true;
        this.push("cta_reached", t);
      }
    } else if (delta !== 0) {
      this.closeRange();
    }
    this.lastTime = t;
    this.save();
  }

  onEnded(t: number) {
    this.onPause(t, true);
    if (!this.s.completeFired) { this.s.completeFired = true; this.push("complete", t); }
    this.flush();
  }

  onCheckout(t: number) { this.push("checkout_click", t); this.flush(true); }

  onLeave(t: number) {
    if (this.hasPlayed && !this.s.completeFired) this.push("abandon", t);
    this.closeRange();
    this.flush(true);
  }

  flush(beacon = false) {
    if (!this.queue.length && !this.dirtyRanges.size) return;
    const payload = JSON.stringify({
      session: {
        id: this.s.id, video_id: this.videoId, viewer_id: viewerId(),
        campaign: this.campaign, referrer: document.referrer || null,
      },
      stats: { watched: r2(this.s.watched), paused: r2(this.s.paused), max_position: r2(this.s.max), duration: this.duration },
      events: this.queue.splice(0, 200),
      ranges: [...this.dirtyRanges.values()].slice(0, 200),
    });
    this.dirtyRanges.clear();
    if (this.openRange) this.dirtyRanges.set(this.openRange.id, { ...this.openRange });
    if (beacon && navigator.sendBeacon) {
      navigator.sendBeacon(this.endpoint, new Blob([payload], { type: "text/plain" }));
    } else {
      fetch(this.endpoint, { method: "POST", body: payload, keepalive: true, headers: { "Content-Type": "text/plain" } }).catch(() => {});
    }
  }

  destroy() { if (this.timer) clearInterval(this.timer); }
}
