export type MiniHook = { at: number; text: string; dur: number };
export type HeadlineSegment = { text: string; color?: string; size?: number; bold?: boolean; underline?: boolean; italic?: boolean };

export type PlayerSettings = {
  // Estilo
  aspect: "9:16" | "16:9";
  rounded: boolean;
  accentColor: string;
  // Progresso inteligente
  showBar: boolean;
  fastBar: boolean;
  barColor: string;
  barHeight: number;
  barAccel: number;
  // Smart autoplay
  autoplay: boolean;
  autoplayText: string;
  autoplayImage: string;
  autoplayImageSize: number;
  autoplayImageX: number;
  autoplayImageY: number;
  // Turbo
  turbo: boolean;
  turboSpeed: number;
  // Headlines
  headline: boolean;
  headlineText: string;
  headlineColor: string;
  headlineAlign: "left" | "center" | "right";
  headlineFontSize: number;
  headlineBold: boolean;
  headlineUnderline: boolean;
  headlineSegments: HeadlineSegment[];
  // Filtro de tráfego
  trafficFilter: boolean;
  trafficParam: string;
  trafficRedirect: string;
  // Botões de ação
  cta: boolean;
  ctaText: string;
  ctaColor: string;
  ctaTextColor: string;
  ctaPulse: boolean;
  // ThumbSniper
  thumbSniper: boolean;
  thumbPauseUrl: string;
  thumbEndUrl: string;
  // Continuar assistindo
  resumePrompt: boolean;
  resumeText: string;
  // Mini-ganchos
  hooks: boolean;
  hookList: MiniHook[];
  // Pixels
  pixels: boolean;
  fbPixel: string;
  ga4: string;
  // Legendas
  captions: boolean;
  captionsUrl: string;
  // Opções de reprodução
  allowPause: boolean;
  pauseText: string;
  blockSeek: boolean;
  lockSpeed: boolean;
  ctaAlways?: boolean; // editor preview only
};

export const DEFAULT_SETTINGS: PlayerSettings = {
  aspect: "9:16",
  rounded: false,
  accentColor: "#e62117",
  showBar: true,
  fastBar: true,
  barColor: "#e62117",
  barHeight: 5,
  barAccel: 32,
  autoplay: true,
  autoplayText: "",
  autoplayImage: "",
  autoplayImageSize: 70,
  autoplayImageX: 50,
  autoplayImageY: 50,
  turbo: false,
  turboSpeed: 1.1,
  headline: false,
  headlineText: "Assista até o final — o melhor vem depois",
  headlineColor: "#ffffff",
  headlineAlign: "center",
  headlineFontSize: 24,
  headlineBold: true,
  headlineUnderline: false,
  headlineSegments: [],
  trafficFilter: false,
  trafficParam: "utm_source",
  trafficRedirect: "",
  cta: true,
  ctaText: "Accede a «La vida con mi ángel»",
  ctaColor: "#16a34a",
  ctaTextColor: "#ffffff",
  ctaPulse: true,
  thumbSniper: false,
  thumbPauseUrl: "",
  thumbEndUrl: "",
  resumePrompt: true,
  resumeText: "Você já começou a assistir este vídeo",
  hooks: false,
  hookList: [],
  pixels: false,
  fbPixel: "",
  ga4: "",
  captions: false,
  captionsUrl: "",
  allowPause: true,
  pauseText: "Vídeo pausado — toque para continuar",
  blockSeek: true,
  lockSpeed: true,
};

export function parseSettings(raw: unknown): PlayerSettings {
  const o = raw && typeof raw === "object" ? (raw as Partial<PlayerSettings>) : {};
  return { ...DEFAULT_SETTINGS, ...o, hookList: Array.isArray(o.hookList) ? o.hookList : [], headlineSegments: Array.isArray(o.headlineSegments) ? o.headlineSegments : [], ctaAlways: false };
}
