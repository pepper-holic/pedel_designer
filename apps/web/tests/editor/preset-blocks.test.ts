import { describe, expect, it } from "vitest";
import { presets } from "../../src/core/library/presets";
import { loadPedalPreset } from "../../src/editor/templateLoading";
import { netlistFromGraph } from "../../src/editor/netlistFromGraph";
import { boundaryTerminals } from "../../src/editor/blockOps";
import { runAcAnalysis } from "../../src/core/solver/ac";
import { GROUND } from "../../src/core/solver/types";

/** Every preset at its defaults and in each of its topology variants. */
const cases = presets.flatMap((preset) => [
  { name: preset.id, preset, variant: undefined },
  ...(preset.variants ?? []).map((variant) => ({ name: `${preset.id} / ${variant.id}`, preset, variant })),
]);

const FREQS = [50, 200, 1000, 4000, 12000];

describe.each(cases.map((c) => [c.name, c] as const))("preset %s decomposed into blocks", (_name, { preset, variant }) => {
  const params = { ...preset.defaultParams, ...(variant?.params ?? {}) };
  const netlist = preset.build(params);
  const loaded = loadPedalPreset(preset, variant);
  const graph = netlistFromGraph(loaded.snapshot.parts, loaded.snapshot.wires);

  it("assigns every element except the audio input to exactly one block", () => {
    expect(preset.blocks, "preset has no block annotation").toBeDefined();
    const owners = new Map<string, string[]>();
    for (const b of preset.blocks!) for (const id of b.elements) owners.set(id, [...(owners.get(id) ?? []), b.id]);
    for (const el of netlist.elements) {
      if (el.id === preset.inputSourceId) continue;
      expect(owners.get(el.id), `${el.id} is in no block`).toBeDefined();
      expect(owners.get(el.id)!.length, `${el.id} is in several blocks`).toBe(1);
    }
    expect(owners.has(preset.inputSourceId), "the audio input must stay outside every block").toBe(false);
  });

  it("declares a port for every connection that crosses a block boundary", () => {
    for (const block of loaded.snapshot.blocks) {
      const members = new Set(loaded.snapshot.parts.filter((p) => p.blockId === block.id).map((p) => p.id));
      const portNets = new Set(block.ports.map((p) => graph.terminalNet.get(`${p.terminal.partId}:${p.terminal.terminalId}`)));
      for (const net of boundaryTerminals(loaded.snapshot.parts, loaded.snapshot.wires, members).keys()) {
        expect(portNets.has(net), `block ${block.id}: net ${net} leaves the block with no port`).toBe(true);
      }
      for (const port of block.ports) expect(members.has(port.terminal.partId), `${block.id}.${port.id}`).toBe(true);
    }
  });

  it("turns every knob into a potentiometer inside its block, surfaced as a block knob", () => {
    for (const knob of preset.knobs ?? []) {
      const present = knob.kind === "pot" ? netlist.elements.some((e) => e.id === knob.upper) : netlist.elements.some((e) => e.id === knob.element);
      if (!present) continue;
      const pot = loaded.snapshot.parts.find((p) => p.id === knob.id);
      expect(pot?.type, knob.id).toBe("potentiometer");
      const block = loaded.snapshot.blocks.find((b) => b.id === pot!.blockId);
      expect(block?.params.some((p) => p.partId === knob.id && p.paramKey === "position"), knob.id).toBe(true);
    }
  });

  it("is electrically the same circuit as the preset's netlist", () => {
    expect(loaded.outputNode).not.toBe("");
    const reference = runAcAnalysis(netlist, { inputSourceId: preset.inputSourceId, outputNode: preset.outputNode, frequenciesHz: FREQS });
    const onCanvas = runAcAnalysis(graph.netlist, { inputSourceId: graph.inputSourceId!, outputNode: loaded.outputNode, frequenciesHz: FREQS });
    onCanvas.forEach((p, i) => expect(p.magnitudeDb, `${p.frequencyHz}Hz`).toBeCloseTo(reference[i].magnitudeDb, 2));
  });

  it("keeps supply sources out of the audio-input role", () => {
    expect(graph.inputSourceId).toBe(preset.inputSourceId);
    for (const p of loaded.snapshot.parts) {
      if (p.type === "vsource" && p.id !== preset.inputSourceId) expect(p.role, p.id).toBe("supply");
    }
    expect(netlist.elements.some((e) => e.nodes.includes(GROUND))).toBe(true);
  });
});
