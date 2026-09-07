import { describe, expect, it } from "vitest";
import { runTransient } from "../../src/core/solver/transient";
import { ratStyleDistortionPreset, klonStyleBlendPreset } from "../../src/core/library/presets/archive";

describe("Archive preset: RAT-style distortion", () => {
  it("clips a large input well below the linear (unclipped) gain prediction", () => {
    const netlist = ratStyleDistortionPreset.build(ratStyleDistortionPreset.defaultParams);
    const linearGain = ratStyleDistortionPreset.defaultParams.feedbackResistance / ratStyleDistortionPreset.defaultParams.inputResistance;

    const inputSamples = new Float64Array([2]); // linear model would predict |out| = 2 * linearGain (94V) - way into clipping
    const { traces } = runTransient(netlist, {
      inputSourceId: ratStyleDistortionPreset.inputSourceId,
      inputSamples,
      sampleRate: 48000,
      tapNodes: ["opout", "out"],
    });

    const unclippedPrediction = 2 * linearGain;
    const out = Math.abs(traces.get("out")![0]);
    expect(out).toBeLessThan(unclippedPrediction * 0.1);
    expect(out).toBeGreaterThan(0.2); // still a real signal, not zeroed out
  });

  it("passes a small signal through close to the linear gain (no clipping yet)", () => {
    const netlist = ratStyleDistortionPreset.build(ratStyleDistortionPreset.defaultParams);
    const linearGain = ratStyleDistortionPreset.defaultParams.feedbackResistance / ratStyleDistortionPreset.defaultParams.inputResistance;

    const inputSamples = new Float64Array([0.005]);
    const { traces } = runTransient(netlist, {
      inputSourceId: ratStyleDistortionPreset.inputSourceId,
      inputSamples,
      sampleRate: 48000,
      tapNodes: ["out"],
    });

    expect(traces.get("out")![0]).toBeCloseTo(-0.005 * linearGain, 2);
  });
});

describe("Archive preset: Klon-style blend", () => {
  it("approaches the clean (unclipped, inverted-follower) path when the drive blend resistor is huge", () => {
    const params = { ...klonStyleBlendPreset.defaultParams, blendDriveResistance: 50_000_000 };
    const netlist = klonStyleBlendPreset.build(params);

    const inputSamples = new Float64Array([1.5]); // large enough to clip the drive path hard if it leaked through
    const { traces } = runTransient(netlist, { inputSourceId: klonStyleBlendPreset.inputSourceId, inputSamples, sampleRate: 48000, tapNodes: ["in", "out"] });

    expect(traces.get("out")![0]).toBeCloseTo(traces.get("in")![0], 1);
  });

  it("approaches the driven (clipped) path when the clean blend resistor is huge", () => {
    const params = { ...klonStyleBlendPreset.defaultParams, blendCleanResistance: 50_000_000 };
    const netlist = klonStyleBlendPreset.build(params);

    const inputSamples = new Float64Array([1.5]);
    const { traces } = runTransient(netlist, {
      inputSourceId: klonStyleBlendPreset.inputSourceId,
      inputSamples,
      sampleRate: 48000,
      tapNodes: ["in", "driveOut", "out"],
    });

    expect(traces.get("out")![0]).toBeCloseTo(traces.get("driveOut")![0], 1);
    // And the drive path should actually be clipping (not tracking the raw linear gain) for this input.
    // Read the gain-setting values off the preset rather than the spread override object: spreading
    // a Record<string, number> and adding one literal key narrows away the index signature.
    const { feedbackResistance, inputResistance } = klonStyleBlendPreset.defaultParams;
    expect(Math.abs(traces.get("out")![0])).toBeLessThan(Math.abs(traces.get("in")![0]) * (feedbackResistance / inputResistance) * 0.2);
  });
});
