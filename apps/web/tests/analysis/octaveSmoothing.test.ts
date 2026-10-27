import { describe, expect, it } from "vitest";
import { logGrid, noteName, smoothSpectrum, tiltDb } from "../../src/core/analysis/octaveSmoothing";
import { computeSpectrum } from "../../src/core/analysis/spectrum";

const flat = (n: number, db: number) => new Float64Array(n).fill(db);

describe("logGrid", () => {
  it("spaces points evenly on a log axis", () => {
    const g = logGrid(20, 20000, 4);
    expect(Array.from(g).map((f) => Math.round(f))).toEqual([20, 200, 2000, 20000]);
  });
});

describe("smoothSpectrum", () => {
  it("leaves a flat spectrum flat at any smoothing", () => {
    const grid = logGrid(20, 20000, 200);
    for (const fraction of [0, 3, 12, 24]) {
      const out = smoothSpectrum(flat(8193, -30), 48000 / 16384, grid, fraction);
      for (const v of out) expect(v).toBeCloseTo(-30, 6);
    }
  });

  it("interpolates between bins at the bottom instead of stepping", () => {
    // Two bins: 0dB at bin 1, -20dB at bin 2 -> halfway reads the mean power (-2.6dB), not a step.
    const db = new Float64Array([-200, 0, -20, -200]);
    const out = smoothSpectrum(db, 10, new Float64Array([15]), 0);
    expect(out[0]).toBeCloseTo(10 * Math.log10((1 + 0.01) / 2), 3);
  });

  it("averages the bins inside each band at the top, so the curve is smooth", () => {
    // Alternating 0dB / -40dB bins (a picket fence) become their mean once a band spans many bins.
    const db = new Float64Array(8193).map((_, k) => (k % 2 ? 0 : -40));
    const out = smoothSpectrum(db, 48000 / 16384, logGrid(5000, 15000, 50), 6);
    const mean = 10 * Math.log10((1 + 1e-4) / 2);
    for (const v of out) expect(v).toBeCloseTo(mean, 1);
  });

  it("keeps a sine's level at its frequency with mild smoothing", () => {
    const fs = 48000;
    const sine = Float64Array.from({ length: fs }, (_, i) => 0.5 * Math.sin((2 * Math.PI * 440 * i) / fs));
    const spectrum = computeSpectrum(sine, fs, { fftSize: 16384 });
    const binHz = spectrum.frequenciesHz[1];
    const [level] = smoothSpectrum(spectrum.magnitudeDb, binHz, new Float64Array([440]), 24);
    // 1/24 octave spreads the (Hann) main lobe a little: within a few dB of -6dB re 1V.
    expect(level).toBeGreaterThan(-12);
    expect(level).toBeLessThan(-5);
  });
});

describe("display helpers", () => {
  it("tilts around 1kHz", () => {
    expect(tiltDb(1000, 4.5)).toBe(0);
    expect(tiltDb(2000, 4.5)).toBeCloseTo(4.5);
    expect(tiltDb(500, 3)).toBeCloseTo(-3);
  });

  it("names the nearest note", () => {
    expect(noteName(440)).toBe("A4 +0¢");
    expect(noteName(82.41)).toBe("E2 +0¢");
    expect(noteName(445)).toBe("A4 +20¢");
  });
});
