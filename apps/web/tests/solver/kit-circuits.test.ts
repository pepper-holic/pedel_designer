import { describe, expect, it } from "vitest";
import { kitCircuits, kitPresets, unsupportedKits } from "../../src/core/library/kits";
import { parsePot, parseValue } from "../../src/core/library/kits/values";
import { buildTopology } from "../../src/core/solver/topology";
import { solveNewton } from "../../src/core/solver/newton";
import { voltageAt } from "../../src/core/solver/solution";
import { runTransient } from "../../src/core/solver/transient";
import { loadPedalPreset } from "../../src/editor/templateLoading";

describe("kit circuit values", () => {
  it("reads the notations printed on kit boards", () => {
    expect(parseValue("4.7K")).toBeCloseTo(4700);
    expect(parseValue("4K7")).toBeCloseTo(4700);
    expect(parseValue("470R")).toBe(470);
    expect(parseValue("2M2")).toBeCloseTo(2.2e6);
    expect(parseValue("220n")).toBeCloseTo(220e-9);
    expect(parseValue("22uF")).toBeCloseTo(22e-6);
    expect(parseValue("4u7")).toBeCloseTo(4.7e-6);
    expect(parseValue("500p")).toBeCloseTo(500e-12);
    expect(parseValue("500mH")).toBeCloseTo(0.5);
    expect(parsePot("A500K")).toEqual({ taper: "A", resistance: 500_000 });
    expect(() => parseValue("4.7Q")).toThrow();
  });
});

describe("kit circuits", () => {
  it("converts every recorded kit or says which part stops it", () => {
    expect(kitCircuits.length).toBeGreaterThan(0);
    expect(kitPresets.length + unsupportedKits.length).toBe(kitCircuits.length);
  });

  describe.each(kitPresets.map((p) => [p.id, p] as const))("%s", (_id, preset) => {
    it("finds a DC operating point with every transistor biased between the rails", () => {
      const netlist = preset.build(preset.defaultParams);
      const topology = buildTopology(netlist);
      const { solution, converged } = solveNewton(netlist, topology, new Map(), 0);
      expect(converged).toBe(true);
      for (const el of netlist.elements) {
        if (el.type !== "bjt") continue;
        const vc = voltageAt(topology, solution, el.nodes[1]);
        expect(vc, `${el.id} collector`).toBeGreaterThan(-0.01);
        expect(vc, `${el.id} collector`).toBeLessThan(9.01);
      }
    });

    it("passes a guitar-level signal to the output without blowing up", () => {
      const samples = new Float64Array(960).map((_, i) => 0.1 * Math.sin((2 * Math.PI * 440 * i) / 48000));
      const r = runTransient(preset.build(preset.defaultParams), { inputSourceId: preset.inputSourceId, inputSamples: samples, sampleRate: 48000, tapNodes: [preset.outputNode] });
      const out = r.traces.get(preset.outputNode)!;
      expect(out.every(Number.isFinite)).toBe(true);
      expect(Math.max(...out.subarray(480).map(Math.abs))).toBeGreaterThan(1e-4);
    });

    it("keeps every hand-placed part where its layout puts it", () => {
      if (!preset.layout) return;
      const { snapshot } = loadPedalPreset(preset);
      for (const [id, spot] of Object.entries(preset.layout)) {
        const part = snapshot.parts.find((p) => p.id === id);
        expect(part, id).toBeDefined();
        expect([part!.x, part!.y, part!.rotation, part!.pinned], id).toEqual([spot.x, spot.y, spot.rotation ?? part!.rotation, true]);
      }
    });

    it("loads into the editor with its pots as knobs", () => {
      const { snapshot } = loadPedalPreset(preset);
      const pots = snapshot.parts.filter((p) => p.type === "potentiometer").map((p) => p.id);
      expect(pots.sort()).toEqual((preset.knobs ?? []).map((k) => k.id).sort());
    });
  });
});
