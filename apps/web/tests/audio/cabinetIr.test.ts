import { describe, expect, it } from "vitest";
import { generateCabinetIr } from "../../src/audio/cabinetIr";

/** Naive single-frequency DFT magnitude (Goertzel-equivalent) - enough to compare relative spectral content between variants without pulling in an FFT dependency. */
function magnitudeAt(signal: Float32Array, freqHz: number, sampleRate: number): number {
  let re = 0;
  let im = 0;
  for (let n = 0; n < signal.length; n++) {
    const angle = (2 * Math.PI * freqHz * n) / sampleRate;
    re += signal[n] * Math.cos(angle);
    im -= signal[n] * Math.sin(angle);
  }
  return Math.hypot(re, im);
}

describe("generateCabinetIr", () => {
  const sampleRate = 48000;

  it("produces a short, finite, non-silent impulse response for both variants", () => {
    for (const variant of ["brightCab4x12", "darkCab2x12"] as const) {
      const ir = generateCabinetIr(sampleRate, variant);
      expect(ir.length).toBeGreaterThan(100);
      expect(ir.length).toBeLessThan(sampleRate * 0.1); // well under 100ms, cabinet-IR-like
      let peak = 0;
      for (const v of ir) {
        expect(Number.isFinite(v)).toBe(true);
        peak = Math.max(peak, Math.abs(v));
      }
      expect(peak).toBeGreaterThan(0);
    }
  });

  it("gives the bright variant more presence-band (3kHz) energy than the dark variant", () => {
    const bright = generateCabinetIr(sampleRate, "brightCab4x12");
    const dark = generateCabinetIr(sampleRate, "darkCab2x12");

    const brightMag = magnitudeAt(bright, 3000, sampleRate);
    const darkMag = magnitudeAt(dark, 3000, sampleRate);

    expect(brightMag).toBeGreaterThan(darkMag);
  });

  it("gives the dark variant more low-mid (150Hz) energy than the bright variant", () => {
    const bright = generateCabinetIr(sampleRate, "brightCab4x12");
    const dark = generateCabinetIr(sampleRate, "darkCab2x12");

    const brightMag = magnitudeAt(bright, 150, sampleRate);
    const darkMag = magnitudeAt(dark, 150, sampleRate);

    expect(darkMag).toBeGreaterThan(brightMag);
  });

  it("scales its length with sample rate (fixed duration in seconds)", () => {
    const ir44 = generateCabinetIr(44100, "brightCab4x12");
    const ir48 = generateCabinetIr(48000, "brightCab4x12");
    expect(ir48.length / ir44.length).toBeCloseTo(48000 / 44100, 1);
  });
});
