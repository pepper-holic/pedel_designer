import { describe, expect, it } from "vitest";
import { runTransient } from "../../src/core/solver/transient";
import type { Netlist } from "../../src/core/solver/types";

describe("RC low-pass step response", () => {
  it("approximates Vout(t) = Vin * (1 - exp(-t / RC))", () => {
    const R = 1000;
    const C = 1e-6;
    const RC = R * C;
    const sampleRate = 48000;
    const dt = 1 / sampleRate;
    const numSamples = Math.round((10 * RC) / dt);

    const netlist: Netlist = {
      elements: [
        { id: "V1", type: "vsource", nodes: ["in", "0"], voltage: 0 },
        { id: "R1", type: "resistor", nodes: ["in", "out"], resistance: R },
        { id: "C1", type: "capacitor", nodes: ["out", "0"], capacitance: C },
      ],
    };

    const inputSamples = new Float64Array(numSamples).fill(1);
    const { traces } = runTransient(netlist, {
      inputSourceId: "V1",
      inputSamples,
      sampleRate,
      tapNodes: ["out"],
    });

    const out = traces.get("out")!;

    const checkAt = (sampleIndex: number) => {
      const t = sampleIndex * dt;
      const expected = 1 - Math.exp(-t / RC);
      expect(out[sampleIndex]).toBeCloseTo(expected, 2);
    };

    checkAt(Math.round(RC / dt)); // one time constant
    checkAt(Math.round((3 * RC) / dt)); // three time constants
    expect(out[numSamples - 1]).toBeCloseTo(1, 3); // settled near steady state
  });
});
