import { describe, expect, it } from "vitest";
import { MAX_PROBES, PROBE_COLORS, pruneProbes, resolveProbes, toggleProbe } from "../../src/editor/probes";
import { loadPedalPreset, loadWiringPreset } from "../../src/editor/templateLoading";
import { netlistFromGraph } from "../../src/editor/netlistFromGraph";
import { presets } from "../../src/core/library/presets";
import { wiringPresets } from "../../src/editor/wiring";
import type { PartInstance } from "../../src/editor/types";

const parts: PartInstance[] = [
  { id: "R1", type: "resistor", x: 0, y: 0, rotation: 0, params: { resistance: 1000 } },
  { id: "R2", type: "resistor", x: 100, y: 0, rotation: 0, params: { resistance: 1000 } },
];
// R1.b and R2.a share net n2; R2.b is ground.
const terminalNet = new Map([
  ["R1:a", "n1"],
  ["R1:b", "n2"],
  ["R2:a", "n2"],
  ["R2:b", "0"],
]);

describe("toggleProbe", () => {
  it("adds a named, coloured probe on a terminal", () => {
    const probes = toggleProbe([], { partId: "R1", terminalId: "a" }, terminalNet);
    expect(probes).toEqual([{ id: "P1", terminal: { partId: "R1", terminalId: "a" }, label: "P1", color: PROBE_COLORS[0] }]);
  });

  it("removes the probe when any terminal on the same net is clicked again", () => {
    const one = toggleProbe([], { partId: "R1", terminalId: "b" }, terminalNet);
    expect(toggleProbe(one, { partId: "R2", terminalId: "a" }, terminalNet)).toEqual([]);
  });

  it("refuses ground and unknown terminals by returning the same array", () => {
    const none: never[] = [];
    expect(toggleProbe(none, { partId: "R2", terminalId: "b" }, terminalNet)).toBe(none);
    expect(toggleProbe(none, { partId: "X9", terminalId: "a" }, terminalNet)).toBe(none);
  });

  it("reuses the first free id and colour after a probe is removed", () => {
    let probes = toggleProbe([], { partId: "R1", terminalId: "a" }, terminalNet);
    probes = toggleProbe(probes, { partId: "R1", terminalId: "b" }, terminalNet);
    probes = probes.filter((p) => p.id !== "P1");
    probes = toggleProbe(probes, { partId: "R1", terminalId: "a" }, terminalNet);
    expect(probes.map((p) => [p.id, p.color])).toEqual([
      ["P2", PROBE_COLORS[1]],
      ["P1", PROBE_COLORS[0]],
    ]);
  });

  it(`stops at ${MAX_PROBES} probes`, () => {
    const many = new Map(Array.from({ length: MAX_PROBES + 1 }, (_, i) => [`R${i}:a`, `n${i + 10}`] as [string, string]));
    let probes = toggleProbe([], { partId: "R0", terminalId: "a" }, many);
    for (let i = 1; i <= MAX_PROBES; i++) probes = toggleProbe(probes, { partId: `R${i}`, terminalId: "a" }, many);
    expect(probes).toHaveLength(MAX_PROBES);
  });
});

describe("resolveProbes / pruneProbes", () => {
  const probes = [
    { id: "P1", terminal: { partId: "R1", terminalId: "b" }, label: "mid", color: "#000" },
    { id: "P2", terminal: { partId: "R2", terminalId: "a" }, label: "dup", color: "#111" },
    { id: "P3", terminal: { partId: "GONE", terminalId: "a" }, label: "stale", color: "#222" },
  ];

  it("attaches each probe's current net, collapsing duplicates and skipping deleted parts", () => {
    expect(resolveProbes(probes, parts, terminalNet).map((p) => [p.id, p.net])).toEqual([["P1", "n2"]]);
  });

  it("prunes only probes whose part is gone", () => {
    expect(pruneProbes(probes, parts).map((p) => p.id)).toEqual(["P1", "P2"]);
  });
});

describe("probes seeded on load", () => {
  it("a pedal preset starts with one probe per tap node, named after it", () => {
    const preset = presets.find((p) => p.id === "ts9-overdrive")!;
    const loaded = loadPedalPreset(preset);
    const graph = netlistFromGraph(loaded.snapshot.parts, loaded.snapshot.wires);
    const resolved = resolveProbes(loaded.probes, loaded.snapshot.parts, graph.terminalNet);
    expect(resolved.map((p) => p.label)).toEqual(preset.tapNodes);
    expect(resolved.some((p) => p.net === loaded.outputNode)).toBe(true);
  });

  it("every pedal preset's seeded probes resolve to distinct real nets", () => {
    for (const preset of presets) {
      const loaded = loadPedalPreset(preset);
      const graph = netlistFromGraph(loaded.snapshot.parts, loaded.snapshot.wires);
      const resolved = resolveProbes(loaded.probes, loaded.snapshot.parts, graph.terminalNet);
      expect(resolved.length, preset.id).toBe(loaded.probes.length);
      expect(resolved.length, preset.id).toBeGreaterThan(0);
    }
  });

  it("a wiring preset starts with a probe on its output", () => {
    for (const preset of wiringPresets) {
      const loaded = loadWiringPreset(preset);
      const graph = netlistFromGraph(loaded.snapshot.parts, loaded.snapshot.wires);
      const resolved = resolveProbes(loaded.probes, loaded.snapshot.parts, graph.terminalNet);
      expect(resolved.map((p) => p.net), preset.id).toEqual([loaded.outputNode]);
    }
  });
});
