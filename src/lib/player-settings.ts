export type PlayerSettings = {
  aspect: "9:16" | "16:9";
  barColor: string;
  showBar: boolean;
  fastBar: boolean;
  allowPause: boolean;
  pauseText: string;
  blockSeek: boolean;
  resumePrompt: boolean;
  resumeText: string;
  ctaText: string;
  ctaColor: string;
  ctaTextColor: string;
  ctaPulse: boolean;
  ctaAlways?: boolean; // editor preview only
};

export const DEFAULT_SETTINGS: PlayerSettings = {
  aspect: "9:16",
  barColor: "#e62117",
  showBar: true,
  fastBar: true,
  allowPause: true,
  pauseText: "Vídeo pausado — toque para continuar",
  blockSeek: true,
  resumePrompt: true,
  resumeText: "Você já começou a assistir este vídeo",
  ctaText: "Accede a «La vida con mi ángel»",
  ctaColor: "#16a34a",
  ctaTextColor: "#ffffff",
  ctaPulse: true,
};

export function parseSettings(raw: unknown): PlayerSettings {
  const o = raw && typeof raw === "object" ? (raw as Partial<PlayerSettings>) : {};
  return { ...DEFAULT_SETTINGS, ...o, ctaAlways: false };
}
