export type TaperType = "A" | "B" | "C";

/** Selectable taper curves for the schematic editor's property inspector. */
export const TAPER_OPTIONS: Record<TaperType, string> = {
  B: "B (선형)",
  A: "A (오디오/로그)",
  C: "C (역오디오)",
};

/**
 * Approximate audio/log taper: most of the resistance change happens in the
 * back half of the rotation, matching how "audio" pots feel on a volume/gain
 * knob. Not a true log curve (it doesn't reach exactly 0 at x=0) - this is
 * the common two-segment approximation used in pedal-building references.
 */
function audioTaper(x: number): number {
  return 10 ** (Math.log10(100) * x) / 100;
}

/** Maps a pot's physical wiper position (0..1) to its electrical split ratio for the given taper law. */
export function applyTaper(taper: TaperType, position: number): number {
  const x = Math.min(Math.max(position, 0), 1);
  switch (taper) {
    case "B":
      return x;
    case "A":
      return audioTaper(x);
    case "C":
      return 1 - audioTaper(1 - x);
  }
}
