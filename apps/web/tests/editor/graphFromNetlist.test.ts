import { describe, expect, it } from "vitest";
import { graphFromNetlist, findEquivalentNode } from "../../src/editor/graphFromNetlist";
import { netlistFromGraph } from "../../src/editor/netlistFromGraph";
import { runAcAnalysis } from "../../src/core/solver/ac";
import { presets } from "../../src/core/library/presets";

describe("graphFromNetlist round-trip", () => {
  for (const preset of presets) {
    it(`${preset.id}: loading as a graph and converting back preserves the AC response`, () => {
      const original = preset.build(preset.defaultParams);
      const { parts, wires } = graphFromNetlist(original, preset.inputSourceId);
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
