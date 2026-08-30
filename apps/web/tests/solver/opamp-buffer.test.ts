import { describe, expect, it } from "vitest";
import { buildTopology } from "../../src/core/solver/topology";
import { solveNewton } from "../../src/core/solver/newton";
import { voltageAt } from "../../src/core/solver/solution";
import type { Netlist } from "../../src/core/solver/types";

describe("Ideal op-amp unity-gain buffer", () => {
  it("forces the output to track the input exactly", () => {
    const netlist: Netlist = {
      elements: [
        { id: "V1", type: "vsource", nodes: ["in", "0"], voltage: 2.5 },
        { id: "U1", type: "opamp", nodes: ["in", "out", "out"], openLoopGain: 1e5 },
      ],
    };

    const topology = buildTopology(netlist);
    const { solution } = solveNewton(netlist, topology, new Map(), 0);
    expect(voltageAt(topology, solution, "out")).toBeCloseTo(2.5, 9);
  });
});
