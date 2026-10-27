import { describe, expect, it } from "vitest";
import { applyEdgeFades, previewClip, PREVIEW_SECONDS } from "../../src/audio/previewClip";

describe("previewClip", () => {
  it("falls back to a short built-in chord when nothing is loaded", () => {
    const clip = previewClip(null, 48000);
    expect(clip.sampleRate).toBe(48000);
    expect(clip.samples.length).toBe(Math.round(48000 * PREVIEW_SECONDS));
    expect(clip.samples.some((v) => Math.abs(v) > 0.01)).toBe(true);
  });

  it("skips leading silence in the user's audio so the clip starts near the attack", () => {
    const sr = 1000;
    const samples = new Float64Array(3000);
    for (let i = 2000; i < 3000; i++) samples[i] = 0.5;
    const clip = previewClip({ samples, sampleRate: sr }, 48000);
    expect(clip.sampleRate).toBe(sr);
    expect(clip.samples[10]).toBeCloseTo(0.5);
    expect(clip.samples.length).toBeLessThanOrEqual(Math.round(sr * PREVIEW_SECONDS));
  });

  it("copes with audio shorter than a preview", () => {
    const clip = previewClip({ samples: new Float64Array([0, 1, 0.5]), sampleRate: 48000 }, 48000);
    expect(clip.samples.length).toBeGreaterThan(0);
  });
});

describe("applyEdgeFades", () => {
  it("ramps both ends to silence without touching the middle or the input", () => {
    const input = new Float64Array(1000).fill(1);
    const out = applyEdgeFades(input, 1000, 0.01);
    expect(out[0]).toBe(0);
    expect(out[out.length - 1]).toBe(0);
    expect(out[500]).toBe(1);
    expect(input[0]).toBe(1);
  });
});
