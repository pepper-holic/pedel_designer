/**
 * Synthetic "generic cabinet simulation" impulse responses - NOT a captured IR of any real,
 * commercially-named cabinet (licensing that kind of IR library is out of scope; see
 * docs/plan-audio-domain-features.md #4). Each variant is built by running a short cascade of
 * parametric EQ biquads (RBJ Audio EQ Cookbook formulas) on a unit impulse, then applying a fast
 * decay envelope so the result stays in the same few-millisecond ballpark as a real speaker/cab IR.
 */

export type CabinetVariant = "brightCab4x12" | "darkCab2x12";

export const CABINET_VARIANTS: Record<CabinetVariant, string> = {
  brightCab4x12: "제네릭 브라이트 4x12 시뮬레이션",
  darkCab2x12: "제네릭 다크 2x12 시뮬레이션",
};

interface BiquadCoeffs {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

/** RBJ cookbook peaking (bell) EQ: boosts/cuts a band around freqHz by gainDb, width set by Q. */
function peakingEq(sampleRate: number, freqHz: number, q: number, gainDb: number): BiquadCoeffs {
  const A = 10 ** (gainDb / 40);
  const w0 = (2 * Math.PI * freqHz) / sampleRate;
  const alpha = Math.sin(w0) / (2 * q);
  const cosW0 = Math.cos(w0);

  const a0 = 1 + alpha / A;
  return {
    b0: (1 + alpha * A) / a0,
    b1: (-2 * cosW0) / a0,
    b2: (1 - alpha * A) / a0,
    a1: (-2 * cosW0) / a0,
    a2: (1 - alpha / A) / a0,
  };
}

/** RBJ cookbook first-order-style highpass (via a wide-Q high-shelf cut) used for the low-cut stage. */
function highShelf(sampleRate: number, freqHz: number, q: number, gainDb: number): BiquadCoeffs {
  const A = 10 ** (gainDb / 40);
  const w0 = (2 * Math.PI * freqHz) / sampleRate;
  const cosW0 = Math.cos(w0);
  const sinW0 = Math.sin(w0);
  const alpha = (sinW0 / 2) * Math.sqrt((A + 1 / A) * (1 / q - 1) + 2);
  const twoSqrtAAlpha = 2 * Math.sqrt(A) * alpha;

  const a0 = (A + 1) - (A - 1) * cosW0 + twoSqrtAAlpha;
  return {
    b0: (A * ((A + 1) + (A - 1) * cosW0 + twoSqrtAAlpha)) / a0,
    b1: (-2 * A * ((A - 1) + (A + 1) * cosW0)) / a0,
    b2: (A * ((A + 1) + (A - 1) * cosW0 - twoSqrtAAlpha)) / a0,
    a1: (2 * ((A - 1) - (A + 1) * cosW0)) / a0,
    a2: ((A + 1) - (A - 1) * cosW0 - twoSqrtAAlpha) / a0,
  };
}

function applyBiquad(coeffs: BiquadCoeffs, input: Float64Array): Float64Array<ArrayBuffer> {
  const { b0, b1, b2, a1, a2 } = coeffs;
  const out = new Float64Array(input.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < input.length; i++) {
    const x0 = input[i];
    const y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    out[i] = y0;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
  }
  return out;
}

const IR_DURATION_SECONDS = 0.02;
const DECAY_TIME_CONSTANT_SECONDS = 0.006;

/** Generates a short synthetic cabinet-shaping impulse response at the given sample rate. */
export function generateCabinetIr(sampleRate: number, variant: CabinetVariant): Float32Array<ArrayBuffer> {
  const length = Math.round(IR_DURATION_SECONDS * sampleRate);
  const impulse = new Float64Array(length);
  impulse[0] = 1;

  const stages: BiquadCoeffs[] =
    variant === "brightCab4x12"
      ? [highShelf(sampleRate, 90, 0.7, -8), peakingEq(sampleRate, 3000, 1.1, 6), peakingEq(sampleRate, 6500, 0.9, -6)]
      : [highShelf(sampleRate, 110, 0.7, -6), peakingEq(sampleRate, 3000, 1.1, -6), peakingEq(sampleRate, 150, 1.0, 4)];

  let signal = impulse;
  for (const stage of stages) signal = applyBiquad(stage, signal);

  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    out[i] = signal[i] * Math.exp(-t / DECAY_TIME_CONSTANT_SECONDS);
  }
  return out;
}
