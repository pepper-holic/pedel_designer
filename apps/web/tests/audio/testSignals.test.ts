import { describe, expect, it } from "vitest";
import { TEST_SIGNALS, generateTestSignal } from "../../src/audio/testSignals";

const SAMPLE_RATE = 48000;

/** Peak absolute value - every generated signal has to stay inside the solver's expected range. */
const peak = (s: Float64Array) => s.reduce((m, v) => Math.max(m, Math.abs(v)), 0);

/** Crude "how much of the energy is above this frequency" measure via zero-crossing rate. */
const zeroCrossings = (s: Float64Array) => {
  let n = 0;
  for (let i = 1; i < s.length; i++) if (Math.sign(s[i]) !== Math.sign(s[i - 1])) n++;
  return n;
};

describe("generateTestSignal", () => {
  it.each(TEST_SIGNALS.map((s) => [s.id, s] as const))("%s produces finite, in-range samples", (_id, signal) => {
    const samples = generateTestSignal(signal.id, SAMPLE_RATE);
    expect(samples.length).toBeGreaterThan(0);
    expect(samples.every((v) => Number.isFinite(v))).toBe(true);
    // A guitar-level signal: the presets and clipping thresholds all assume roughly +-1V, so a
    // generator that overshoots would make every circuit look like it clips.
    expect(peak(samples)).toBeGreaterThan(0.05);
    expect(peak(samples)).toBeLessThanOrEqual(1.0001);
  });

  it("sweeps from low to high, so the second half crosses zero far more often than the first", () => {
    const s = generateTestSignal("sweep", SAMPLE_RATE);
    const half = Math.floor(s.length / 2);
    expect(zeroCrossings(s.slice(half))).toBeGreaterThan(zeroCrossings(s.slice(0, half)) * 2);
  });

  it("puts an impulse at the very start and silence after it", () => {
    const s = generateTestSignal("impulse", SAMPLE_RATE);
    expect(Math.abs(s[0])).toBeCloseTo(1, 3);
    expect(peak(s.slice(10))).toBe(0);
  });

  it("builds the chord from several simultaneous partials rather than one tone", () => {
    const chord = generateTestSignal("chord", SAMPLE_RATE);
    const single = generateTestSignal("note", SAMPLE_RATE);
    // A single decaying note has a steady crossing rate; a chord beats, so its crossing count
    // differs measurably from the plain note of the same length.
    expect(chord.length).toBe(single.length);
    expect(zeroCrossings(chord)).not.toBe(zeroCrossings(single));
  });

  it("returns an empty buffer for an unknown id instead of throwing", () => {
    expect(generateTestSignal("nope", SAMPLE_RATE).length).toBe(0);
  });
});
