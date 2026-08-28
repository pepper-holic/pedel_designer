import { describe, expect, it } from "vitest";
import { runChainedTransient } from "../../src/core/analysis/chain";
import { bufferPreset } from "../../src/core/library/presets/buffer";
import { opampDrivePreset } from "../../src/core/library/presets/opamp-drive";
import { generateSineWave } from "../../src/audio/testTone";

const SAMPLE_RATE = 48000;

function stageOf(preset: typeof bufferPreset) {
  return { netlist: preset.build(preset.defaultParams), inputSourceId: preset.inputSourceId, outputNode: preset.outputNode };
}

describe("runChainedTransient", () => {
  it("a single buffer stage passes the signal through unchanged", () => {
    const input = generateSineWave(1000, 0.1, SAMPLE_RATE, 0.001);
    const output = runChainedTransient([stageOf(bufferPreset)], input, SAMPLE_RATE);
    for (let i = 0; i < input.length; i++) expect(output[i]).toBeCloseTo(input[i], 6);
  });

  it("two buffers in series still pass the signal through unchanged (identity chain)", () => {
    const input = generateSineWave(1000, 0.1, SAMPLE_RATE, 0.001);
    const output = runChainedTransient([stageOf(bufferPreset), stageOf(bufferPreset)], input, SAMPLE_RATE);
    for (let i = 0; i < input.length; i++) expect(output[i]).toBeCloseTo(input[i], 6);
  });

  it("chaining two clipping gain stages compresses harder than either stage alone", () => {
    const input = new Float64Array([0.02]);
    const single = runChainedTransient([stageOf(opampDrivePreset)], input, SAMPLE_RATE);
    const chained = runChainedTransient([stageOf(opampDrivePreset), stageOf(opampDrivePreset)], input, SAMPLE_RATE);

    // Chaining should NOT simply square the gain (that would be a much larger unclipped value) -
    // the second stage's own clipping caps it well below single-stage-gain^2 * input.
    const singleGain = opampDrivePreset.defaultParams.feedbackResistance / opampDrivePreset.defaultParams.inputResistance;
    const naiveDoubleGainPrediction = input[0] * singleGain * singleGain;
    expect(Math.abs(chained[0])).toBeLessThan(Math.abs(naiveDoubleGainPrediction) * 0.5);
    expect(Math.abs(chained[0])).toBeGreaterThan(Math.abs(single[0])); // still louder/more driven than one stage
  });

  it("an empty chain returns the input unchanged", () => {
    const input = generateSineWave(1000, 0.1, SAMPLE_RATE, 0.001);
    const output = runChainedTransient([], input, SAMPLE_RATE);
    expect(output).toBe(input);
  });
});
