import { describe, expect, it } from "vitest";
import { netlistFromGraph } from "../../src/editor/netlistFromGraph";
import { buildTopology } from "../../src/core/solver/topology";
import { solveNewton } from "../../src/core/solver/newton";
import { voltageAt } from "../../src/core/solver/solution";
import type { PartInstance, Wire } from "../../src/editor/types";

describe("Potentiometer part", () => {
  it("splits into two resistors that form a voltage divider at the wiper", () => {
    const parts: PartInstance[] = [
      { id: "V1", type: "vsource", x: 0, y: 0, rotation: 0, params: { voltage: 9 } },
      { id: "P1", type: "potentiometer", x: 100, y: 0, rotation: 0, params: { resistance: 100_000, position: 0.3 } },
      { id: "G1", type: "ground", x: 100, y: 100, rotation: 0, params: {} },
    ];
    const wires: Wire[] = [
      { id: "w1", a: { partId: "V1", terminalId: "positive" }, b: { partId: "P1", terminalId: "a" } },
      { id: "w2", a: { partId: "P1", terminalId: "b" }, b: { partId: "G1", terminalId: "gnd" } },
      { id: "w3", a: { partId: "V1", terminalId: "negative" }, b: { partId: "G1", terminalId: "gnd" } },
    ];

    const { netlist } = netlistFromGraph(parts, wires);
    expect(netlist.elements).toHaveLength(3); // V1 + two split resistors

    const topology = buildTopology(netlist);
    const { solution } = solveNewton(netlist, topology, new Map(), 0);
    const wiperNode = netlist.elements.find((e) => e.id === "P1:a")!.nodes[1];
    const vWiper = voltageAt(topology, solution, wiperNode);

    expect(vWiper).toBeCloseTo(9 * (1 - 0.3), 6);
  });
});
