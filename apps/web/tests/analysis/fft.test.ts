import { describe, expect, it } from "vitest";
import { fft, nextPowerOfTwo } from "../../src/core/analysis/fft";

describe("fft", () => {
  it("throws on non-power-of-2 length", () => {
    expect(() => fft(new Float64Array(6), new Float64Array(6))).toThrow();
  });

  it("resolves a pure sine tone to a single bin at the expected frequency", () => {
    const n = 1024;
    const sampleRate = 48000;
    const freqHz = 1000; // bin index = freqHz * n / sampleRate = 21.33... pick an exact bin instead
    const binIndex = Math.round((freqHz * n) / sampleRate);
    const exactFreq = (binIndex * sampleRate) / n;

    const re = new Float64Array(n);
    const im = new Float64Array(n);
    for (let i = 0; i < n; i++) re[i] = Math.sin((2 * Math.PI * exactFreq * i) / sampleRate);

    fft(re, im);

    const magnitudes = Array.from({ length: n / 2 }, (_, i) => Math.hypot(re[i], im[i]));
    const peakBin = magnitudes.indexOf(Math.max(...magnitudes));
    expect(peakBin).toBe(binIndex);

    // Energy should be concentrated at the peak bin, not spread evenly.
    const totalEnergy = magnitudes.reduce((a, b) => a + b, 0);
    expect(magnitudes[peakBin] / totalEnergy).toBeGreaterThan(0.8);
  });

  it("a DC (constant) signal produces energy only in bin 0", () => {
    const n = 8;
    const re = new Float64Array(n).fill(3);
    const im = new Float64Array(n);
    fft(re, im);
    expect(re[0]).toBeCloseTo(24, 9); // sum of all samples
    for (let i = 1; i < n; i++) {
      expect(Math.hypot(re[i], im[i])).toBeCloseTo(0, 9);
    }
  });
});

describe("nextPowerOfTwo", () => {
  it("returns the same value when already a power of 2", () => {
    expect(nextPowerOfTwo(1024)).toBe(1024);
  });

  it("rounds up to the next power of 2", () => {
    expect(nextPowerOfTwo(1000)).toBe(1024);
    expect(nextPowerOfTwo(1025)).toBe(2048);
  });

  it("handles n <= 1", () => {
    expect(nextPowerOfTwo(0)).toBe(1);
    expect(nextPowerOfTwo(1)).toBe(1);
  });
});
