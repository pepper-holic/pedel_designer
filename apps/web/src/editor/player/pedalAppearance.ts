/** How a pedal's face looks in the player view and on exported enclosure art - purely cosmetic, no
 * effect on the circuit itself. Optional and additive in storage so old saves load unaffected. */
export interface PedalAppearance {
  bodyColor: string;
  textColor: string;
  accentColor: string;
  fontFamily: string;
}

/** Matches the app's own default look (the CSS vars these shadow), so a circuit saved before this
 * feature existed - or one that never touched it - renders exactly as it always has. */
export const DEFAULT_APPEARANCE: PedalAppearance = {
  bodyColor: "#ffffff",
  textColor: "#18181b",
  accentColor: "#18181b",
  fontFamily: "Space Grotesk",
};

export interface FontOption {
  label: string;
  family: string;
}

/** A short, curated list rather than every Google Font - each one reads clearly at pedal-label size
 * and covers a different stompbox mood (clean modern, bold stencil, vintage script, technical mono). */
export const FONT_OPTIONS: FontOption[] = [
  { label: "모던 (기본)", family: "Space Grotesk" },
  { label: "스텐실 (볼드)", family: "Oswald" },
  { label: "빈티지 (초대형)", family: "Bebas Neue" },
  { label: "손글씨", family: "Permanent Marker" },
  { label: "테크니컬 (모노)", family: "JetBrains Mono" },
];

export function isPedalAppearance(value: unknown): value is PedalAppearance {
  const a = value as PedalAppearance;
  return !!a && typeof a.bodyColor === "string" && typeof a.textColor === "string" && typeof a.accentColor === "string" && typeof a.fontFamily === "string";
}
