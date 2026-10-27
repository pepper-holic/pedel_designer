import { describe, expect, it } from "vitest";
import { BLOCK_DEFS } from "../../src/editor/blocks";
import { instantiateBlock } from "../../src/editor/blockInstance";
import { netlistFromGraph } from "../../src/editor/netlistFromGraph";
import { runAcAnalysis } from "../../src/core/solver/ac";
import { runTransient } from "../../src/core/solver/transient";
import type { Element, Netlist } from "../../src/core/solver/types";

/** Drives a block's ports the way a real board would: a signal source on IN, 9V on V+ / supply. */
function harness(elements: Element[], inNode: string | undefined, supplyNode: string | undefined): Netlist {
  const extra: Element[] = [];
  if (inNode) extra.push({ id: "__VIN", type: "vsource", nodes: [inNode, "0"], voltage: 0 });
  if (supplyNode) extra.push({ id: "__VCC", type: "vsource", nodes: [supplyNode, "0"], voltage: 9, role: "supply" });
  return { elements: [...extra, ...elements] };
}

const FREQS = [100, 1000, 5000];

describe.each(BLOCK_DEFS.map((d) => [d.id, d] as const))("library block %s", (_id, def) => {
  const placed = instantiateBlock(def, "blk1", { x: 100, y: 100 });
  const graph = netlistFromGraph(placed.parts, placed.wires);
  const netOf = (kind: string) => {
    const port = placed.block.ports.find((p) => p.kind === kind);
    return port ? graph.terminalNet.get(`${port.terminal.partId}:${port.terminal.terminalId}`) : undefined;
  };

  it("places with consistent membership, ports and knobs", () => {
    const ids = new Set(placed.parts.map((p) => p.id));
    expect(placed.parts.every((p) => p.blockId === "blk1")).toBe(true);
    expect(placed.block.ports.map((p) => p.kind).sort()).toEqual(def.ports.map((p) => p.kind).sort());
    for (const port of placed.block.ports) expect(ids.has(port.terminal.partId), port.id).toBe(true);
    for (const param of placed.block.params) expect(ids.has(param.partId), param.id).toBe(true);
    expect(placed.block.params.map((p) => p.label)).toEqual((def.knobs ?? []).map((k) => k.label));
    for (const w of placed.wires) expect(ids.has(w.a.partId) && ids.has(w.b.partId), w.id).toBe(true);
  });

  it("is electrically the same circuit as its netlist once knobs become pots", () => {
    const inNet = netOf("in");
    const outNet = netOf("out");
    if (!inNet || !outNet) return; // loads and power have no in->out path to compare
    const original = def.build();
    const nodeOf = (kind: string) => def.ports.find((p) => p.kind === kind)?.node;
    const reference = runAcAnalysis(harness(original.elements, nodeOf("in"), nodeOf("supply")), {
      inputSourceId: "__VIN",
      outputNode: nodeOf("out")!,
      frequenciesHz: FREQS,
    });
    const onCanvas = runAcAnalysis(harness(graph.netlist.elements, inNet, netOf("supply")), { inputSourceId: "__VIN", outputNode: outNet, frequenciesHz: FREQS });
    onCanvas.forEach((p, i) => expect(p.magnitudeDb, `${p.frequencyHz}Hz`).toBeCloseTo(reference[i].magnitudeDb, 2));
  });

  it("passes a signal without NaN or convergence failures", () => {
    const inNet = netOf("in");
    const outNet = netOf("out") ?? inNet;
    if (!inNet || !outNet) return;
    const sr = 48000;
    const input = Float64Array.from({ length: 2400 }, (_, i) => 0.3 * Math.sin((2 * Math.PI * 440 * i) / sr));
    const { traces, nonConvergentSampleCount } = runTransient(harness(graph.netlist.elements, inNet, netOf("supply")), {
      inputSourceId: "__VIN",
      inputSamples: input,
      sampleRate: sr,
      tapNodes: [outNet],
    });
    expect(nonConvergentSampleCount).toBe(0);
    expect(traces.get(outNet)!.every(Number.isFinite)).toBe(true);
  });
});

describe("block behaviour", () => {
  const ac = (id: string, f: number[], setKnob?: (parts: ReturnType<typeof instantiateBlock>["parts"]) => void) => {
    const def = BLOCK_DEFS.find((d) => d.id === id)!;
    const placed = instantiateBlock(def, "b", { x: 0, y: 0 });
    setKnob?.(placed.parts);
    const graph = netlistFromGraph(placed.parts, placed.wires);
    const net = (kind: string) => {
      const port = placed.block.ports.find((p) => p.kind === kind);
      return port ? graph.terminalNet.get(`${port.terminal.partId}:${port.terminal.terminalId}`) : undefined;
    };
    return runAcAnalysis(harness(graph.netlist.elements, net("in"), net("supply")), { inputSourceId: "__VIN", outputNode: net("out")!, frequenciesHz: f }).map(
      (p) => p.magnitudeDb,
    );
  };

  it("gain blocks amplify at 1kHz", () => {
    for (const id of ["gain-stage-inverting", "gain-opamp-noninverting", "gain-bjt-ce", "gain-jfet-cs"]) {
      expect(ac(id, [1000])[0], id).toBeGreaterThan(6);
    }
  });

  it("buffers pass the signal at about unity", () => {
    for (const id of ["buffer-follower", "input-buffer-bjt", "input-buffer-jfet"]) {
      expect(Math.abs(ac(id, [1000])[0]), id).toBeLessThan(1.5);
    }
  });

  it("the DRIVE knob raises gain", () => {
    const low = ac("gain-opamp-noninverting", [1000], (parts) => {
      parts.find((p) => p.id === "b_DRIVE")!.params.position = 0.1;
    })[0];
    const high = ac("gain-opamp-noninverting", [1000], (parts) => {
      parts.find((p) => p.id === "b_DRIVE")!.params.position = 0.9;
    })[0];
    expect(high).toBeGreaterThan(low + 6);
  });

  it("TONE on the passive low-pass brightens as it is turned up", () => {
    const dark = ac("tone-stack-passive", [5000], (parts) => {
      parts.find((p) => p.id === "b_TONE")!.params.position = 0.1;
    })[0];
    const bright = ac("tone-stack-passive", [5000], (parts) => {
      parts.find((p) => p.id === "b_TONE")!.params.position = 0.9;
    })[0];
    expect(bright).toBeGreaterThan(dark + 3);
  });

  it("the Big Muff tone scoops the mids at noon", () => {
    const [low, mid, high] = ac("tone-muff", [100, 1000, 8000]);
    expect(mid).toBeLessThan(low);
    expect(mid).toBeLessThan(high);
  });

  it("the Fender stack's three knobs each move their own band", () => {
    const at = (knob: string, position: number, f: number) =>
      ac("tone-fender-tmb", [f], (parts) => {
        parts.find((p) => p.id === `b_${knob}`)!.params.position = position;
      })[0];
    expect(at("MID", 1, 1000) - at("MID", 0, 1000)).toBeGreaterThan(6);
    expect(at("TREBLE", 1, 8000) - at("TREBLE", 0.5, 8000)).toBeGreaterThan(6);
    expect(at("BASS", 1, 80) - at("BASS", 0.5, 80)).toBeGreaterThan(3);
    // At noon the mids sit below the bass - the scoop these stacks are known for.
    const [low, mid] = ac("tone-fender-tmb", [80, 1000]);
    expect(mid).toBeLessThan(low - 3);
  });

  it("VOLUME at zero is silent and at full passes the signal", () => {
    const off = ac("output-volume", [1000], (parts) => {
      parts.find((p) => p.id === "b_VOLUME")!.params.position = 0;
    })[0];
    const full = ac("output-volume", [1000], (parts) => {
      parts.find((p) => p.id === "b_VOLUME")!.params.position = 1;
    })[0];
    expect(off).toBeLessThan(-40);
    expect(full).toBeGreaterThan(-1);
  });
});
