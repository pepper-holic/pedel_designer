import { describe, expect, it } from "vitest";
import { PART_DEFS, type PartType } from "../../../src/editor/partDefs";
import { FOOTPRINTS, padForTerminal } from "../../../src/editor/pcb/footprints";
import { footprintFor, footprintOptions } from "../../../src/editor/pcb/footprintAssign";
import { buildBoardNetlist } from "../../../src/editor/pcb/boardNetlist";
import { buildKicadNetlist } from "../../../src/editor/kicadNetlist";
import { netlistFromGraph } from "../../../src/editor/netlistFromGraph";
import { loadPedalPreset } from "../../../src/editor/templateLoading";
import { presets } from "../../../src/core/library/presets";
import { BJT_2N3904, BJT_BC549, BLUE_LED, SILICON_DIODE_1N4148 } from "../../../src/core/library/deviceModels";
import type { PartInstance, Wire } from "../../../src/editor/types";

const part = (id: string, type: PartType, params: Record<string, number | string> = {}, extra: Partial<PartInstance> = {}): PartInstance => ({
  id,
  type,
  x: 0,
  y: 0,
  rotation: 0,
  params: { ...PART_DEFS[type].defaultParams, ...params },
  ...extra,
});
const wire = (a: string, b: string): Wire => {
  const [pa, ta] = a.split(":");
  const [pb, tb] = b.split(":");
  return { id: `${a}-${b}`, a: { partId: pa, terminalId: ta }, b: { partId: pb, terminalId: tb } };
};

describe("footprints", () => {
  it("gives every physical part type at least one footprint, and every terminal its own pad", () => {
    for (const type of Object.keys(PART_DEFS) as PartType[]) {
      if (type === "ground") continue;
      const options = footprintOptions(type);
      expect(options.length, type).toBeGreaterThan(0);
      for (const footprint of options) {
        const terminals = PART_DEFS[type].terminals;
        const pads = terminals.map((t, i) => padForTerminal(footprint, t.id, i));
        expect(new Set(pads).size, `${type} on ${footprint.id}`).toBe(terminals.length);
        const padNumbers = new Set(footprint.pads.map((p) => p.number));
        for (const p of pads) expect(padNumbers.has(p), `${type} pad ${p} on ${footprint.id}`).toBe(true);
      }
    }
  });

  it("puts each transistor's legs where its datasheet says", () => {
    const pads = (p: PartInstance) => {
      const f = footprintFor(p)!;
      return Object.fromEntries(PART_DEFS.bjt.terminals.map((t, i) => [t.id, padForTerminal(f, t.id, i)]));
    };
    // 2N3904: E-B-C seen from the flat face; BC549: C-B-E.
    expect(pads(part("Q1", "bjt", BJT_2N3904))).toEqual({ emitter: "1", base: "2", collector: "3" });
    expect(pads(part("Q2", "bjt", BJT_BC549))).toEqual({ collector: "1", base: "2", emitter: "3" });
  });

  it("puts a diode's cathode (the band) on pad 1, and fits LEDs as LEDs", () => {
    const d = part("D1", "diode", { ...SILICON_DIODE_1N4148 });
    expect(footprintFor(d)!.id).toBe("d-do35");
    expect(padForTerminal(footprintFor(d)!, "cathode", 1)).toBe("1");
    expect(footprintFor(part("D2", "diode", { ...BLUE_LED }))!.id).toBe("led-5");
  });

  it("picks a capacitor package from its value, and honours an explicit choice", () => {
    expect(footprintFor(part("C1", "capacitor", { capacitance: 470e-12 }))!.id).toBe("c-disc-2.5");
    expect(footprintFor(part("C2", "capacitor", { capacitance: 47e-9 }))!.id).toBe("c-film-5");
    expect(footprintFor(part("C3", "capacitor", { capacitance: 100e-6 }))!.id).toBe("cp-8");
    expect(footprintFor(part("C4", "capacitor", { capacitance: 47e-9 }, { footprintId: "c-film-7.5" }))!.id).toBe("c-film-7.5");
    // A choice that does not fit the type is ignored rather than producing a nonsense board.
    expect(footprintFor(part("C5", "capacitor", { capacitance: 47e-9 }, { footprintId: "dip8-single" }))!.id).toBe("c-film-5");
  });
});

describe("buildBoardNetlist", () => {
  it("turns an electrolytic so its + lead faces the higher DC voltage", () => {
    // 9V -> R -> node "a"; C1 is drawn with its "a" terminal on ground and "b" on the 9V side.
    const parts = [
      part("V2", "vsource", { voltage: 9 }, { role: "supply" }),
      part("R1", "resistor", { resistance: 1000 }),
      part("C1", "capacitor", { capacitance: 10e-6 }),
      part("GND1", "ground"),
    ];
    const wires = [wire("V2:positive", "R1:a"), wire("R1:b", "C1:b"), wire("C1:a", "GND1:gnd"), wire("V2:negative", "GND1:gnd")];
    const board = buildBoardNetlist(parts, netlistFromGraph(parts, wires));
    const c1 = board.components.find((c) => c.ref === "C1")!;
    expect(c1.footprint.polarized).toBe(true);
    expect(c1.pads.find((p) => p.number === "1")!.net).not.toBe("GND");
    expect(c1.pads.find((p) => p.number === "2")!.net).toBe("GND");
  });

  it("wires an op-amp's supply pins and adds the power and output connectors a board needs", () => {
    const parts = [part("V1", "vsource"), part("U1", "opamp"), part("R1", "resistor"), part("GND1", "ground")];
    const wires = [wire("V1:positive", "U1:inPlus"), wire("U1:out", "R1:a"), wire("R1:b", "U1:inMinus"), wire("V1:negative", "GND1:gnd")];
    const graph = netlistFromGraph(parts, wires);
    const outNet = graph.terminalNet.get("U1:out")!;
    const board = buildBoardNetlist(parts, graph, outNet);
    const u1 = board.components.find((c) => c.ref === "U1")!;
    const padNet = (n: string) => u1.pads.find((p) => p.number === n)?.net;
    expect([padNet("3"), padNet("6"), padNet("7"), padNet("4")]).toEqual(["IN", "OUT", "V+", "V-"]);
    expect(board.components.some((c) => c.value.startsWith("op-amp 전원"))).toBe(true);
    expect(board.components.some((c) => c.value === "출력 잭 (OUT)")).toBe(true);
    expect(board.notes.some((n) => n.includes("VREF"))).toBe(true);
  });

  it("gives parts with free-form ids proper, unique reference designators", () => {
    const parts = [part("Rin", "resistor"), part("R1", "resistor"), part("resistor7", "resistor"), part("Q1", "bjt")];
    const refs = buildBoardNetlist(parts, netlistFromGraph(parts, [])).components.map((c) => c.ref);
    expect(new Set(refs).size).toBe(refs.length);
    expect(refs).toContain("R1");
    expect(refs.filter((r) => /^R\d+$/.test(r))).toHaveLength(3);
  });

  it.each(presets.map((p) => [p.name, p] as const))("exports %s to KiCad with every footprint assigned", (_name, preset) => {
    const { snapshot, outputNode } = loadPedalPreset(preset);
    const graph = netlistFromGraph(snapshot.parts, snapshot.wires);
    const board = buildBoardNetlist(snapshot.parts, graph, outputNode);
    const physical = snapshot.parts.filter((p) => p.type !== "ground");
    expect(board.components.filter((c) => c.partId !== null)).toHaveLength(physical.length);
    // Every net the circuit uses reaches the board.
    for (const net of graph.netNames) if (net !== "0") expect(board.nets.some((n) => n === net || n === "OUT" || n === "IN"), net).toBe(true);
    const kicad = buildKicadNetlist(snapshot.parts, graph, "t", outputNode);
    expect(kicad).not.toContain('(footprint "")');
    expect(kicad.match(/\(comp /g)!.length).toBe(board.components.length);
  });
});

describe("FOOTPRINTS", () => {
  it("names a KiCad library footprint for every entry", () => {
    for (const f of Object.values(FOOTPRINTS)) expect(f.kicadName).toMatch(/^[\w.]+:\S+$/);
  });
});
