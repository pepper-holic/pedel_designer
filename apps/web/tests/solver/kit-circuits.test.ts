import { describe, expect, it } from "vitest";
import { kitCircuits, kitPresets, unsupportedKits } from "../../src/core/library/kits";
import { parsePot, parseValue } from "../../src/core/library/kits/values";
import { buildTopology } from "../../src/core/solver/topology";
import { solveNewton } from "../../src/core/solver/newton";
import { voltageAt } from "../../src/core/solver/solution";
import { runTransient } from "../../src/core/solver/transient";
import { loadPedalPreset } from "../../src/editor/templateLoading";

/** A GBW-limited op-amp driving a large capacitor straight off its output (Brown Charlie's Vref buffer into
 * 100uF) takes a few seconds of transient on its own, more under a full parallel run. */
const SIGNAL_TIMEOUT_MS = 20_000;
/** The realtime engine's warm-up from rest (realtimeEngine.ts WARMUP_SECONDS = 0.3) at 48kHz. */
const WARMUP_SAMPLES = 14_400;

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

describe("charge-pump kits", () => {
  it("runs a positive-ground germanium board on the ICL7660's ideal -9V rail", () => {
    const preset = kitPresets.find((p) => p.id === "pp-ranger-ge")!;
    const netlist = preset.build(preset.defaultParams);
    const rail = netlist.elements.find((e) => e.id === "Vrail1");
    expect(rail?.type === "vsource" && rail.voltage).toBe(-9);
    expect(netlist.elements.some((e) => e.id === "U1")).toBe(false);
    expect(netlist.elements.some((e) => e.id === "C6")).toBe(false);
    const topology = buildTopology(netlist);
    const { solution, converged } = solveNewton(netlist, topology, new Map(), 0);
    expect(converged).toBe(true);
    const q1 = netlist.elements.find((e) => e.id === "Q1")!;
    const vc = voltageAt(topology, solution, q1.nodes[1]);
    expect(vc).toBeLessThan(-1);
    expect(vc).toBeGreaterThan(-8.5);
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
      const railVolts = netlist.elements.flatMap((el) => (el.type === "vsource" && el.role === "supply" ? [el.voltage] : []));
      const [lo, hi] = [Math.min(0, ...railVolts), Math.max(0, ...railVolts)];
      for (const el of netlist.elements) {
        if (el.type !== "bjt") continue;
        const vc = voltageAt(topology, solution, el.nodes[1]);
        expect(vc, `${el.id} collector`).toBeGreaterThan(lo - 0.01);
        expect(vc, `${el.id} collector`).toBeLessThan(hi + 0.01);
      }
    });

    it("passes a guitar-level signal to the output without blowing up", () => {
      // A transient starts from rest. Most boards pass signal within 20ms; one whose bias charges slowly (DS ONE: 47uF
      // Vref behind 5K, cut-off buffers until it rises) gets the 0.3s warm-up the realtime engine gives every circuit.
      const run = (warmup: number) => {
        const samples = new Float64Array(warmup + 960).map((_, i) => 0.1 * Math.sin((2 * Math.PI * 440 * i) / 48000));
        const r = runTransient(preset.build(preset.defaultParams), { inputSourceId: preset.inputSourceId, inputSamples: samples, sampleRate: 48000, tapNodes: [preset.outputNode] });
        return r.traces.get(preset.outputNode)!.subarray(warmup);
      };
      const peak = (out: Float64Array) => Math.max(...out.subarray(480).map(Math.abs));
      let out = run(0);
      if (peak(out) <= 1e-4) out = run(WARMUP_SAMPLES);
      expect(out.every(Number.isFinite)).toBe(true);
      expect(peak(out)).toBeGreaterThan(1e-4);
    }, SIGNAL_TIMEOUT_MS);

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
