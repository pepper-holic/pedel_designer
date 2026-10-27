import { generateTestSignal } from "./testSignals";

/** Long enough to hear a note's attack and a bit of its decay, short enough that a 1x solve of a
 * mid-size pedal finishes in well under a second (see the bench baseline). */
export const PREVIEW_SECONDS = 0.6;

/**
 * The clip a knob preview plays: the user's own loaded audio when there is one (starting where it
 * first gets loud, so the clip is not 0.6s of leading silence), otherwise the built-in chord.
 */
export function previewClip(source: { samples: Float64Array; sampleRate: number } | null, fallbackSampleRate: number): { samples: Float64Array; sampleRate: number } {
  if (!source) {
    const chord = generateTestSignal("chord", fallbackSampleRate);
    return { samples: chord.subarray(0, Math.round(fallbackSampleRate * PREVIEW_SECONDS)), sampleRate: fallbackSampleRate };
  }
  const { samples, sampleRate } = source;
  let peak = 0;
  for (const v of samples) peak = Math.max(peak, Math.abs(v));
  let start = 0;
  if (peak > 0) {
    while (start < samples.length && Math.abs(samples[start]) < peak * 0.1) start++;
  }
  // Back off a few ms so the pick attack itself is in the clip, not cut in half.
  start = Math.max(0, Math.min(start - Math.round(sampleRate * 0.005), samples.length - 1));
  const length = Math.min(Math.round(sampleRate * PREVIEW_SECONDS), samples.length - start);
  return { samples: samples.subarray(start, start + length), sampleRate };
}

/** Short fades at both ends so a preview never starts or stops on a click. */
export function applyEdgeFades(samples: Float64Array, sampleRate: number, fadeSeconds = 0.01): Float64Array {
  const out = Float64Array.from(samples);
  const n = Math.min(Math.round(sampleRate * fadeSeconds), Math.floor(out.length / 2));
  for (let i = 0; i < n; i++) {
    const g = i / n;
    out[i] *= g;
    out[out.length - 1 - i] *= g;
  }
  return out;
}
