import { describe, expect, it } from "vitest";
import { runTransient } from "../../src/core/solver/transient";
import type { Netlist } from "../../src/core/solver/types";

describe("runTransient oversampling", () => {
  it("keeps output trace length equal to input length regardless of oversample factor", () => {
    const netlist: Netlist = {
      elements: [
        { id: "V1", type: "vsource", nodes: ["in", "0"], voltage: 0 },
        { id: "R1", type: "resistor", nodes: ["in", "out"], resistance: 1000 },
        { id: "C1", type: "capacitor", nodes: ["out", "0"], capacitance: 1e-6 },
      ],
    };
    const inputSamples = new Float64Array(50).fill(1);

    for (const oversample of [1, 4, 8]) {
      const { traces } = runTransient(netlist, {
        inputSourceId: "V1",
        inputSamples,
        sampleRate: 48000,
        tapNodes: ["out"],
        oversample,
      });
      expect(traces.get("out")!.length).toBe(inputSamples.length);
    }
  });

  it("agrees with the unsampled result on a linear RC circuit (no knee to alias)", () => {
    const netlist: Netlist = {
      elements: [
        { id: "V1", type: "vsource", nodes: ["in", "0"], voltage: 0 },
        { id: "R1", type: "resistor", nodes: ["in", "out"], resistance: 1000 },
        { id: "C1", type: "capacitor", nodes: ["out", "0"], capacitance: 1e-6 },
      ],
    };
    const inputSamples = new Float64Array(200).fill(1);

    const base = runTransient(netlist, { inputSourceId: "V1", inputSamples, sampleRate: 48000, tapNodes: ["out"] });
    const oversampled = runTransient(netlist, {
      inputSourceId: "V1",
      inputSamples,
      sampleRate: 48000,
      tapNodes: ["out"],
      oversample: 8,
    });

    const baseOut = base.traces.get("out")!;
    const oversampledOut = oversampled.traces.get("out")!;
    // Box-car averaging the sub-samples acts as a light low-pass filter, so exact equality isn't
    // expected - just agreement within a few percent once the step response has settled.
    for (let i = 10; i < baseOut.length; i++) {
      expect(oversampledOut[i]).toBeCloseTo(baseOut[i], 1);
    }
  });

  it("resolves a fast diode knee that the unsampled solve blurs across a sample", () => {
    // Germanium-style diode: thermalVoltage*emissionCoefficient (~veff) of ~0.031V means the knee
    // finishes its transition in microseconds - well inside one 48kHz sample period (~20.8us).
    const netlist: Netlist = {
      elements: [
        { id: "V1", type: "vsource", nodes: ["in", "0"], voltage: 0 },
        { id: "R1", type: "resistor", nodes: ["in", "out"], resistance: 100 },
        {
          id: "D1",
          type: "diode",
          nodes: ["out", "0"],
          saturationCurrent: 1e-6,
          thermalVoltage: 0.02585,
          emissionCoefficient: 1.2,
        },
      ],
    };
    // A step straight through the knee region.
    const inputSamples = new Float64Array([0, 0, 2, 2, 2]);

    const base = runTransient(netlist, { inputSourceId: "V1", inputSamples, sampleRate: 48000, tapNodes: ["out"] });
    const oversampled = runTransient(netlist, {
      inputSourceId: "V1",
      inputSamples,
      sampleRate: 48000,
      tapNodes: ["out"],
      oversample: 8,
    });

    const baseOut = base.traces.get("out")!;
    const oversampledOut = oversampled.traces.get("out")!;
    // Both solves settle to the same final operating point once the input has been at 2V for a
    // full sample...
    expect(oversampledOut[4]).toBeCloseTo(baseOut[4], 1);
    // ...but sample index 1 is where the step from 0V to 2V actually happens (inputSamples[1]=0,
    // inputSamples[2]=2). The unsampled solve applies that as a zero-order hold at 0V for the whole
    // period; the oversampled solve linearly ramps 0V->2V across its sub-steps and drives the diode
    // through its knee mid-block, so the two solves diverge here even though both use the same
    // input samples.
    expect(oversampledOut[1]).not.toBeCloseTo(baseOut[1], 3);
  });
});
