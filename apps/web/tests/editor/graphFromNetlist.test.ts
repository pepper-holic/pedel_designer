import { describe, expect, it } from "vitest";
import { graphFromNetlist, findEquivalentNode } from "../../src/editor/graphFromNetlist";
import { netlistFromGraph } from "../../src/editor/netlistFromGraph";
import { runAcAnalysis } from "../../src/core/solver/ac";
import { presets } from "../../src/core/library/presets";
import type { Netlist } from "../../src/core/solver/types";

describe("graphFromNetlist layout override", () => {
  const netlist: Netlist = {
    elements: [
      { id: "V1", type: "vsource", nodes: ["in", "0"], voltage: 0 },
      { id: "R1", type: "resistor", nodes: ["in", "out"], resistance: 1000 },
    ],
  };

  it("places an element at its explicit layout coordinates instead of the auto-computed grid position", () => {
    const { parts } = graphFromNetlist(netlist, "V1", { R1: { x: 777, y: 333 } });
    const r1 = parts.find((p) => p.id === "R1")!;
    expect(r1.x).toBe(777);
    expect(r1.y).toBe(333);
  });

  it("falls back to the automatic BFS layout for elements missing from a partial layout map", () => {
    const auto = graphFromNetlist(netlist, "V1");
    const partial = graphFromNetlist(netlist, "V1", { R1: { x: 777, y: 333 } });
    const v1Auto = auto.parts.find((p) => p.id === "V1")!;
    const v1Partial = partial.parts.find((p) => p.id === "V1")!;
    expect(v1Partial.x).toBe(v1Auto.x);
    expect(v1Partial.y).toBe(v1Auto.y);
  });

  it("is a no-op (identical to the automatic layout) when no layout argument is passed - regression guard", () => {
    const withoutArg = graphFromNetlist(netlist, "V1");
    const withUndefined = graphFromNetlist(netlist, "V1", undefined);
    expect(withUndefined.parts).toEqual(withoutArg.parts);
  });
});

describe("graphFromNetlist barycenter row assignment", () => {
  it("re-sorts a column's rows to match connected neighbors instead of keeping raw declaration order", () => {
    // Two independent branches (A, B) fan out from V1 and rejoin at separate output nodes. B2 is
    // declared before A2, so a naive declaration-order row assignment would put A1/B2 on the same
    // row and B1/A2 on the same row - crossing the two branches' wires for no reason. The
    // barycenter pass should instead pull each branch onto a single consistent row.
    const netlist: Netlist = {
      elements: [
        { id: "V1", type: "vsource", nodes: ["in", "0"], voltage: 0 },
        { id: "A1", type: "resistor", nodes: ["in", "na"], resistance: 1000 },
        { id: "B1", type: "resistor", nodes: ["in", "nb"], resistance: 1000 },
        { id: "B2", type: "resistor", nodes: ["nb", "outB"], resistance: 1000 },
        { id: "A2", type: "resistor", nodes: ["na", "outA"], resistance: 1000 },
      ],
    };

    const { parts } = graphFromNetlist(netlist, "V1");
    const byId = new Map(parts.map((p) => [p.id, p]));

    expect(byId.get("A1")!.y).toBe(byId.get("A2")!.y);
    expect(byId.get("B1")!.y).toBe(byId.get("B2")!.y);
    expect(byId.get("A1")!.y).not.toBe(byId.get("B1")!.y);
  });
});

describe("graphFromNetlist round-trip", () => {
  for (const preset of presets) {
    it(`${preset.id}: loading as a graph and converting back preserves the AC response`, () => {
      const original = preset.build(preset.defaultParams);
      const { parts, wires } = graphFromNetlist(original, preset.inputSourceId, preset.layout);
      const graph = netlistFromGraph(parts, wires);

      expect(graph.inputSourceId).toBe(preset.inputSourceId);

      const equivalentOutput = findEquivalentNode(original, preset.outputNode, graph.netlist);
      expect(equivalentOutput).not.toBeNull();

      const frequenciesHz = [100, 1000, 5000];
      const before = runAcAnalysis(original, { inputSourceId: preset.inputSourceId, outputNode: preset.outputNode, frequenciesHz });
      const after = runAcAnalysis(graph.netlist, { inputSourceId: graph.inputSourceId!, outputNode: equivalentOutput!, frequenciesHz });

      for (let i = 0; i < frequenciesHz.length; i++) {
        expect(after[i].magnitudeDb).toBeCloseTo(before[i].magnitudeDb, 6);
        expect(after[i].phaseDeg).toBeCloseTo(before[i].phaseDeg, 6);
      }
    });
  }
});
