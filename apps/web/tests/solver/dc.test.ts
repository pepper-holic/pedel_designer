import { describe, expect, it } from "vitest";
import { buildTopology } from "../../src/core/solver/topology";
import { solveNewton } from "../../src/core/solver/newton";
import { voltageAt } from "../../src/core/solver/solution";
import type { Netlist } from "../../src/core/solver/types";

describe("DC voltage divider", () => {
  it("matches the analytic R2/(R1+R2) divider ratio", () => {
    const netlist: Netlist = {
      elements: [
        { id: "V1", type: "vsource", nodes: ["in", "0"], voltage: 5 },
        { id: "R1", type: "resistor", nodes: ["in", "out"], resistance: 1000 },
        { id: "R2", type: "resistor", nodes: ["out", "0"], resistance: 3000 },
      ],
    };

    const topology = buildTopology(netlist);
    const solution = solveNewton(netlist, topology, new Map(), 0);
    const vout = voltageAt(topology, solution, "out");

    expect(vout).toBeCloseTo(5 * (3000 / (1000 + 3000)), 9);
  });
});
