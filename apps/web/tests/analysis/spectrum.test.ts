import { describe, expect, it } from "vitest";
import { computeSpectrum, findSpectrumPeaks } from "../../src/core/analysis/spectrum";

const SR = 48000;

function sine(freq: number, amplitude: number, seconds = 0.5): Float64Array {
  const out = new Float64Array(Math.round(SR * seconds));
  for (let i = 0; i < out.length; i++) out[i] = amplitude * Math.sin((2 * Math.PI * freq * i) / SR);
  return out;
}

function levelAt(spectrum: ReturnType<typeof computeSpectrum>, f: number): number {
  let best = -Infinity;
  for (let k = 0; k < spectrum.frequenciesHz.length; k++) {
    if (Math.abs(spectrum.frequenciesHz[k] - f) < 12) best = Math.max(best, spectrum.magnitudeDb[k]);
  }
  return best;
}

describe("computeSpectrum", () => {
  it("puts a sine's peak at its frequency, scaled so 1V peak reads ~0dB", () => {
    const spectrum = computeSpectrum(sine(1000, 1), SR);
    const [peak] = findSpectrumPeaks(spectrum, 1);
    expect(Math.abs(peak.frequencyHz - 1000)).toBeLessThan(6);
    // Hann scalloping loss is at most ~1.4dB between bins.
    expect(peak.magnitudeDb).toBeGreaterThan(-1.6);
    expect(peak.magnitudeDb).toBeLessThan(0.2);
  });

  it("tracks amplitude: half the voltage is ~6dB lower", () => {
    const full = findSpectrumPeaks(computeSpectrum(sine(997, 1), SR), 1)[0].magnitudeDb;
    const half = findSpectrumPeaks(computeSpectrum(sine(997, 0.5), SR), 1)[0].magnitudeDb;
    expect(full - half).toBeCloseTo(6.02, 1);
  });

  it("keeps window leakage far below the fundamental away from it", () => {
    const spectrum = computeSpectrum(sine(1000, 1), SR);
    expect(levelAt(spectrum, 3000)).toBeLessThan(-80);
  });

  it("shows the odd harmonics a symmetric hard clip adds", () => {
    const clipped = sine(500, 1).map((v) => Math.max(-0.5, Math.min(0.5, v)));
    const spectrum = computeSpectrum(clipped, SR);
    const fundamental = levelAt(spectrum, 500);
    // Symmetric clipping: strong 3rd and 5th, (near) no 2nd.
    expect(levelAt(spectrum, 1500)).toBeGreaterThan(fundamental - 20);
    expect(levelAt(spectrum, 2500)).toBeGreaterThan(fundamental - 30);
    expect(levelAt(spectrum, 1000)).toBeLessThan(fundamental - 60);
  });

  it("still returns a spectrum for a signal shorter than one frame", () => {
    const spectrum = computeSpectrum(sine(2000, 1, 0.01), SR);
    expect(spectrum.frequenciesHz.length).toBeGreaterThan(8);
    expect(spectrum.magnitudeDb.every((v) => Number.isFinite(v))).toBe(true);
  });
});

describe("findSpectrumPeaks", () => {
  it("lists distinct tones loudest first, not one tone's neighbouring bins", () => {
    const mix = sine(440, 1).map((v, i) => v + 0.1 * Math.sin((2 * Math.PI * 3000 * i) / SR));
    const peaks = findSpectrumPeaks(computeSpectrum(mix, SR), 2);
    expect(peaks).toHaveLength(2);
    expect(Math.abs(peaks[0].frequencyHz - 440)).toBeLessThan(6);
    expect(Math.abs(peaks[1].frequencyHz - 3000)).toBeLessThan(6);
  });
});
