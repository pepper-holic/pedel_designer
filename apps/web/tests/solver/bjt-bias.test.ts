import { describe, expect, it } from "vitest";
import { buildTopology } from "../../src/core/solver/topology";
import { solveNewton } from "../../src/core/solver/newton";
import { voltageAt } from "../../src/core/solver/solution";
import type { Netlist } from "../../src/core/solver/types";

describe("NPN fixed-bias common-emitter stage", () => {
  it("biases into forward-active region with the expected Ic ~= Bf * Ib", () => {
    const bf = 100;
    const netlist: Netlist = {
      elements: [
        { id: "Vcc", type: "vsource", nodes: ["vcc", "0"], voltage: 9 },
        { id: "Rb", type: "resistor", nodes: ["vcc", "b"], resistance: 1_000_000 },
        { id: "Rc", type: "resistor", nodes: ["vcc", "c"], resistance: 1_000 },
        {
          id: "Q1",
          type: "bjt",
          nodes: ["b", "c", "0"],
          polarity: "npn",
          saturationCurrent: 1e-14,
          thermalVoltage: 0.02585,
          forwardBeta: bf,
          reverseBeta: 1,
        },
      ],
    };

    const topology = buildTopology(netlist);
    const solution = solveNewton(netlist, topology, new Map(), 0);

    const vb = voltageAt(topology, solution, "b");
    const vc = voltageAt(topology, solution, "c");

    // Base-emitter drop lands in the typical silicon forward-voltage range.
    expect(vb).toBeGreaterThan(0.5);
    expect(vb).toBeLessThan(0.8);

    // Comfortably in forward-active region (collector well above saturation, below Vcc).
    expect(vc).toBeGreaterThan(6);
    expect(vc).toBeLessThan(9);

    const ib = (9 - vb) / 1_000_000;
    const ic = (9 - vc) / 1_000;
    expect(ic / ib).toBeCloseTo(bf, 0);
  });
});
