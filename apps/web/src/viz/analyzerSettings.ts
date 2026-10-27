import { useSyncExternalStore } from "react";

/** How the analyzer looks - the same knobs FabFilter Pro-Q's analyzer has. */
export interface AnalyzerSettings {
  /** Fractional-octave smoothing: 1/N octave, 0 = none (only the display's own resolution). */
  smoothing: 0 | 3 | 6 | 12 | 24;
  /** FFT length: frequency resolution at the bottom of the range. */
  resolution: 4096 | 8192 | 16384 | 32768;
  /** How quickly the live curve follows the sound. */
  speed: "fast" | "medium" | "slow";
  /** Display slope around 1kHz, dB per octave. */
  tilt: 0 | 3 | 4.5;
  /** dB shown below the top of the plot. */
  range: 60 | 90 | 120;
  /** Keep a falling line at each frequency's recent maximum. */
  peakHold: boolean;
}

export const DEFAULT_ANALYZER: AnalyzerSettings = { smoothing: 12, resolution: 16384, speed: "medium", tilt: 0, range: 90, peakHold: true };

/** Averaging time constant per speed, seconds. */
export const SPEED_SECONDS: Record<AnalyzerSettings["speed"], number> = { fast: 0.04, medium: 0.15, slow: 0.5 };

const KEY = "pedal-designer:analyzer";
let current: AnalyzerSettings = read();
const listeners = new Set<() => void>();

function read(): AnalyzerSettings {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<AnalyzerSettings> | null;
    return stored ? { ...DEFAULT_ANALYZER, ...stored } : DEFAULT_ANALYZER;
  } catch {
    return DEFAULT_ANALYZER;
  }
}

export function setAnalyzerSettings(patch: Partial<AnalyzerSettings>) {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // still applies for this session
  }
  for (const listener of listeners) listener();
}

/** One set of analyzer settings for the whole app (dock and player view), remembered. */
export function useAnalyzerSettings(): AnalyzerSettings {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
  );
}
