import { describe, expect, it } from "vitest";
import { runTransient } from "../../src/core/solver/transient";
import { ts9OverdrivePreset as ts9Preset } from "../../src/core/library/presets/ts9-overdrive";
import { generateTestSignal } from "../../src/audio/testSignals";
import { generateSineWave } from "../../src/audio/testTone";

const SAMPLE_RATE = 48000;

/**
 * A hard clipper driven by a real signal is where the per-sample Newton solve struggles: starting
 * every sample from zero volts throws away the fact that the operating point moved only slightly
 * since the previous sample, so the iteration count creeps up and the cap gets hit
 * (docs/ROADMAP.md §6 risk 4).
 */
describe("transient convergence on a clipping circuit", () => {
  it("converges on essentially every sample of a decaying note through a feedback clipper", () => {
    const netlist = ts9Preset.build(ts9Preset.defaultParams);
    const input = generateTestSignal("note", SAMPLE_RATE);

    const { nonConvergentSampleCount, traces } = runTransient(netlist, {
      inputSourceId: ts9Preset.inputSourceId,
      inputSamples: input,
      sampleRate: SAMPLE_RATE,
      tapNodes: [ts9Preset.outputNode],
    });

    // Some stiff samples are tolerable; a quarter of the file is not.
    expect(nonConvergentSampleCount).toBeLessThan(input.length * 0.001);
    expect(traces.get(ts9Preset.outputNode)!.every((v) => Number.isFinite(v))).toBe(true);
  });

  it("produces the same output as a cold start on a circuit where both converge", () => {
    // Warm starting must only change how many iterations it takes to get there, never the answer.
    // A small signal is used on purpose: the cold path has to actually converge for its output to
    // be a meaningful reference, which at full level it does not (that is the point of the test above).
    const input = generateSineWave(220, 0.1, SAMPLE_RATE, 0.05);
    const run = (warmStart: boolean) =>
      runTransient(ts9Preset.build(ts9Preset.defaultParams), {
        inputSourceId: ts9Preset.inputSourceId,
        inputSamples: input,
        sampleRate: SAMPLE_RATE,
        tapNodes: [ts9Preset.outputNode],
        warmStart,
      });

    const warm = run(true);
    const cold = run(false);
    expect(cold.nonConvergentSampleCount).toBe(0);
    expect(warm.nonConvergentSampleCount).toBe(0);

    const a = warm.traces.get(ts9Preset.outputNode)!;
    const b = cold.traces.get(ts9Preset.outputNode)!;
    for (let i = 0; i < a.length; i += 13) expect(a[i]).toBeCloseTo(b[i], 6);
  });
});
