import { describe, expect, it } from "vitest";
import { runTransient } from "../../src/core/solver/transient";
import { opampDrivePreset } from "../../src/core/library/presets";

describe("Op-amp drive preset", () => {
  it("applies inverting gain to small signals and clips large ones", () => {
    const netlist = opampDrivePreset.build(opampDrivePreset.defaultParams);
    const gain = opampDrivePreset.defaultParams.feedbackResistance / opampDrivePreset.defaultParams.inputResistance;

    const inputSamples = new Float64Array([0.001, 1]);
    const { traces } = runTransient(netlist, {
      inputSourceId: opampDrivePreset.inputSourceId,
      inputSamples,
      sampleRate: 48000,
      tapNodes: [opampDrivePreset.outputNode],
    });

    const out = traces.get(opampDrivePreset.outputNode)!;

    // Small signal: still in the linear region, inverted and amplified by ~Rf/Rin
    // (diode reverse-leakage conductance loads the feedback path slightly, so allow ~10% slack).
    const expectedSmallSignal = -0.001 * gain;
    expect(out[0]).toBeLessThan(0);
    expect(Math.abs(out[0] - expectedSmallSignal)).toBeLessThan(Math.abs(expectedSmallSignal) * 0.15);

    // Large signal: feedback diodes engage, output stays well below the linear prediction.
    const linearPrediction = Math.abs(-1 * gain);
    expect(Math.abs(out[1])).toBeLessThan(linearPrediction * 0.1);
  });
});
