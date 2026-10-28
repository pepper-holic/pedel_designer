import { fft, nextPowerOfTwo } from "./fft";

export interface HarmonicMagnitude {
  order: number; // 1 = fundamental, 2 = 2nd harmonic, ...
  frequencyHz: number;
  /** Raw FFT bin magnitude - arbitrary units, not comparable across signals or to thdPercent on its
   * own. Use percentOfFundamental for anything shown to a user or checked against thdPercent. */
  magnitude: number;
  /** magnitude / fundamentalMagnitude * 100 - the same normalization thdPercent itself uses, so
   * sqrt(sum of these^2)) reproduces thdPercent (a user sanity-checking the breakdown should land on
   * the same number, not a raw FFT magnitude that has no fixed relationship to a percentage). */
  percentOfFundamental: number;
}

export interface ThdResult {
  fundamentalHz: number;
  fundamentalMagnitude: number;
  harmonics: HarmonicMagnitude[]; // orders 2..maxHarmonic
  /** sqrt(sum(harmonic amplitudes^2)) / fundamental amplitude, as a percentage. */
  thdPercent: number;
}

/** Hann window - reduces spectral leakage so harmonic bins aren't swamped by fundamental sidelobes. */
function applyHannWindow(signal: Float64Array): Float64Array {
  const n = signal.length;
  const windowed = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const w = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
    windowed[i] = signal[i] * w;
  }
  return windowed;
}

/**
 * Total Harmonic Distortion of a (nominally steady-state, single-tone) time-domain signal: locates
 * the fundamental and its harmonics in the FFT magnitude spectrum and reports THD = sqrt(sum of
 * harmonic power) / fundamental amplitude. Caller supplies the known drive frequency rather than
 * having this function guess the fundamental, since guitar-pedal test tones are always synthesized
 * at a known frequency here (see audio/testTone.ts).
 */
export function computeThd(signal: Float64Array, sampleRate: number, fundamentalHz: number, maxHarmonic = 5): ThdResult {
  const n = nextPowerOfTwo(signal.length);
  const windowed = applyHannWindow(signal.length === n ? signal : signal.slice(0, Math.min(signal.length, n)));
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  re.set(windowed);

  fft(re, im);

  const binHz = sampleRate / n;
  const magnitudeAt = (freqHz: number): number => {
    const bin = Math.round(freqHz / binHz);
    if (bin < 0 || bin >= n / 2) return 0;
    return Math.hypot(re[bin], im[bin]);
  };

  const fundamentalMagnitude = magnitudeAt(fundamentalHz);
  const harmonics: HarmonicMagnitude[] = [];
  let harmonicPower = 0;
  for (let order = 2; order <= maxHarmonic; order++) {
    const frequencyHz = fundamentalHz * order;
    const magnitude = magnitudeAt(frequencyHz);
    const percentOfFundamental = fundamentalMagnitude > 0 ? (magnitude / fundamentalMagnitude) * 100 : 0;
    harmonics.push({ order, frequencyHz, magnitude, percentOfFundamental });
    harmonicPower += magnitude * magnitude;
  }

  const thdPercent = fundamentalMagnitude > 0 ? (Math.sqrt(harmonicPower) / fundamentalMagnitude) * 100 : 0;

  return { fundamentalHz, fundamentalMagnitude, harmonics, thdPercent };
}
