import { describe, expect, it } from "vitest";
import { runTransient } from "../../src/core/solver/transient";
import type { Netlist } from "../../src/core/solver/types";

describe("Resistor + antiparallel diode clipper", () => {
  it("clips a large input near the diode forward voltage", () => {
    const netlist: Netlist = {
      elements: [
        { id: "V1", type: "vsource", nodes: ["in", "0"], voltage: 0 },
        { id: "R1", type: "resistor", nodes: ["in", "out"], resistance: 10000 },
        {
          id: "D1",
          type: "diode",
          nodes: ["out", "0"],
          saturationCurrent: 4.352e-9,
          thermalVoltage: 0.02585,
          emissionCoefficient: 1.906,
        },
        {
          id: "D2",
          type: "diode",
          nodes: ["0", "out"],
          saturationCurrent: 4.352e-9,
          thermalVoltage: 0.02585,
          emissionCoefficient: 1.906,
        },
      ],
    };

    const sampleRate = 48000;
    const inputSamples = new Float64Array([0.05, 1, 3, 5, -3, -5]);
    const { traces } = runTransient(netlist, {
      inputSourceId: "V1",
      inputSamples,
      sampleRate,
      tapNodes: ["out"],
    });

    const out = traces.get("out")!;

    // Small signal passes through nearly unclipped.
    expect(out[0]).toBeCloseTo(0.05, 2);
    // Large signals clip to roughly the diode pair's forward voltage, well below the input.
    expect(Math.abs(out[3])).toBeLessThan(1);
    expect(Math.abs(out[3])).toBeGreaterThan(0.3);
    // Clipping is symmetric for a symmetric antiparallel pair.
    expect(out[3]).toBeCloseTo(-out[5], 2);
  });
});
