import { describe, expect, it } from "vitest";
import { computeThd } from "../../src/core/analysis/thd";
import { generateSineWave } from "../../src/audio/testTone";
import { runTransient } from "../../src/core/solver/transient";
import { bufferPreset } from "../../src/core/library/presets/buffer";
import { diodeClipperPreset } from "../../src/core/library/presets/diode-clipper";

const SAMPLE_RATE = 48000;
const FREQ_HZ = 1000;

function runTone(preset: typeof bufferPreset, amplitude: number, durationSec = 0.05): Float64Array {
  const inputSamples = generateSineWave(FREQ_HZ, amplitude, SAMPLE_RATE, durationSec);
  const netlist = preset.build(preset.defaultParams);
  const { traces } = runTransient(netlist, {
    inputSourceId: preset.inputSourceId,
    inputSamples,
    sampleRate: SAMPLE_RATE,
    tapNodes: [preset.outputNode],
  });
  return traces.get(preset.outputNode)!;
}

describe("computeThd", () => {
  it("reports near-zero THD for a pure synthesized sine (sanity check on the FFT/harmonic math itself)", () => {
    const signal = generateSineWave(FREQ_HZ, 1, SAMPLE_RATE, 0.05);
    const result = computeThd(signal, SAMPLE_RATE, FREQ_HZ);
    expect(result.thdPercent).toBeLessThan(1);
  });

  it("reports low THD for a linear unity buffer (no clipping device in the signal path)", () => {
    const output = runTone(bufferPreset, 0.5);
    const result = computeThd(output, SAMPLE_RATE, FREQ_HZ);
    expect(result.thdPercent).toBeLessThan(1);
  });

  it("reports substantially higher THD once a diode clipper is driven into clipping", () => {
    const clean = runTone(diodeClipperPreset, 0.05); // well below the diode knee - stays linear
    const clipped = runTone(diodeClipperPreset, 3); // large input - hard clips

    const cleanThd = computeThd(clean, SAMPLE_RATE, FREQ_HZ).thdPercent;
    const clippedThd = computeThd(clipped, SAMPLE_RATE, FREQ_HZ).thdPercent;

    expect(clippedThd).toBeGreaterThan(cleanThd * 5);
    expect(clippedThd).toBeGreaterThan(5); // real, substantial distortion
  });

  it("returns per-order harmonic magnitudes alongside the aggregate THD", () => {
    const output = runTone(diodeClipperPreset, 3);
    const result = computeThd(output, SAMPLE_RATE, FREQ_HZ);
    expect(result.harmonics).toHaveLength(4); // orders 2..5
    expect(result.harmonics.map((h) => h.order)).toEqual([2, 3, 4, 5]);
    expect(result.harmonics.every((h) => Number.isFinite(h.magnitude))).toBe(true);
  });
});
