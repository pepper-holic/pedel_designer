import { describe, expect, it } from "vitest";
import { detectOpAmpStage, opAmpStageLayout } from "../../src/editor/layout/opampStage";
import { netlistFromGraph } from "../../src/editor/netlistFromGraph";
import type { PartInstance, Wire } from "../../src/editor/types";

const order = (a: string, b: string) => a.localeCompare(b);

/** Builds the detector's inputs (byId, terminalNet, ground/supply predicates) from a plain part+wire
 * list, the same way arrange.ts assembles them for a real circuit. */
function stageInput(parts: PartInstance[], wires: Wire[], members: string[]) {
  const { terminalNet } = netlistFromGraph(parts, wires);
  const byId = new Map(parts.map((p) => [p.id, p]));
  const groundNet = terminalNet.get("GND:gnd");
  return {
    members,
    byId,
    terminalNet,
    touchesGround: (id: string) => [...terminalNet.entries()].some(([k, v]) => k.startsWith(`${id}:`) && v === groundNet),
    touchesSupply: () => false,
    order,
  };
}

const opamp = (id: string): PartInstance => ({ id, type: "opamp", x: 0, y: 0, rotation: 0, params: {} });
const resistor = (id: string): PartInstance => ({ id, type: "resistor", x: 0, y: 0, rotation: 0, params: { resistance: 1000 } });
const diode = (id: string): PartInstance => ({ id, type: "diode", x: 0, y: 0, rotation: 0, params: {} });
const ground = (id: string): PartInstance => ({ id, type: "ground", x: 0, y: 0, rotation: 0, params: {} });

describe("detectOpAmpStage", () => {
  it("recognizes a plain inverting stage: series input, one feedback element, nothing on the other input", () => {
    const parts = [resistor("Rin"), diode("D1"), opamp("U1")];
    const wires: Wire[] = [
      { id: "w1", a: { partId: "Rin", terminalId: "b" }, b: { partId: "U1", terminalId: "inMinus" } },
      { id: "w2", a: { partId: "D1", terminalId: "anode" }, b: { partId: "U1", terminalId: "inMinus" } },
      { id: "w3", a: { partId: "D1", terminalId: "cathode" }, b: { partId: "U1", terminalId: "out" } },
    ];
    const stage = detectOpAmpStage(stageInput(parts, wires, ["Rin", "D1", "U1"]));
    expect(stage).toEqual({ opampId: "U1", inputId: "Rin", signalInput: "inMinus", feedbackIds: ["D1"], outAdjacentId: null, groundLegId: null });

    const { placement, mirror } = opAmpStageLayout(stage!);
    expect(placement.get("Rin")).toEqual({ col: 0, row: 0 });
    // The op-amp sits 20px below the row so its (mirrored, now upper) "-" pin lands exactly on it.
    expect(placement.get("U1")).toEqual({ col: 1, row: 0, dy: 20 });
    expect(mirror.get("U1")).toBe(true);
    // The feedback element is a rung above the op-amp, in its column.
    expect(placement.get("D1")).toMatchObject({ col: 1, row: 0 });
    expect(placement.get("D1")!.dy).toBeLessThan(0);
  });

  it("stacks every feedback element as a rung of one ladder in the op-amp's column, nearest first in the given order", () => {
    const parts = [resistor("Rin"), resistor("Rf"), diode("D1"), diode("D2"), opamp("U1")];
    const wires: Wire[] = [
      { id: "w1", a: { partId: "Rin", terminalId: "b" }, b: { partId: "U1", terminalId: "inMinus" } },
      { id: "w2", a: { partId: "Rf", terminalId: "a" }, b: { partId: "U1", terminalId: "inMinus" } },
      { id: "w3", a: { partId: "Rf", terminalId: "b" }, b: { partId: "U1", terminalId: "out" } },
      { id: "w4", a: { partId: "D1", terminalId: "anode" }, b: { partId: "U1", terminalId: "inMinus" } },
      { id: "w5", a: { partId: "D1", terminalId: "cathode" }, b: { partId: "U1", terminalId: "out" } },
      { id: "w6", a: { partId: "D2", terminalId: "cathode" }, b: { partId: "U1", terminalId: "inMinus" } },
      { id: "w7", a: { partId: "D2", terminalId: "anode" }, b: { partId: "U1", terminalId: "out" } },
    ];
    const stage = detectOpAmpStage(stageInput(parts, wires, ["Rin", "Rf", "D1", "D2", "U1"]));
    expect(stage!.feedbackIds).toEqual(["D1", "D2", "Rf"]); // alphabetical, via `order`

    const { placement } = opAmpStageLayout(stage!);
    const rungs = ["D1", "D2", "Rf"].map((id) => placement.get(id)!);
    for (const r of rungs) expect(r).toMatchObject({ col: 1, row: 0 });
    // Rungs climb away from the op-amp at a fixed pitch, one above the other, never side by side.
    expect(rungs[0].dy!).toBeLessThan(0);
    expect(rungs[1].dy!).toBeLessThan(rungs[0].dy!);
    expect(rungs[2].dy!).toBeLessThan(rungs[1].dy!);
    expect(new Set(rungs.map((r) => r.dy)).size).toBe(3);
  });

  it("recognizes a non-inverting stage: bias resistor to ground on one input, the other input bare (fed from outside the group)", () => {
    const parts = [resistor("Rg"), resistor("Rf"), opamp("U1"), ground("GND")];
    const wires: Wire[] = [
      { id: "w1", a: { partId: "Rg", terminalId: "a" }, b: { partId: "U1", terminalId: "inMinus" } },
      { id: "w2", a: { partId: "Rg", terminalId: "b" }, b: { partId: "GND", terminalId: "gnd" } },
      { id: "w3", a: { partId: "Rf", terminalId: "a" }, b: { partId: "U1", terminalId: "inMinus" } },
      { id: "w4", a: { partId: "Rf", terminalId: "b" }, b: { partId: "U1", terminalId: "out" } },
    ];
    const stage = detectOpAmpStage(stageInput(parts, wires, ["Rg", "Rf", "U1"]));
    expect(stage).toEqual({ opampId: "U1", inputId: null, signalInput: "inPlus", feedbackIds: ["Rf"], outAdjacentId: null, groundLegId: "Rg" });

    // Non-inverting: "+" stays on top (no mirror) with the signal row through it; the feedback rung
    // and its ground leg both go underneath, the leg hanging off the bottom of the left rail.
    const { placement, mirror } = opAmpStageLayout(stage!);
    expect(mirror.get("U1")).toBe(false);
    expect(placement.get("U1")).toEqual({ col: 0, row: 0, dy: 20 });
    expect(placement.get("Rf")!.dy).toBeGreaterThan(0);
    expect(placement.get("Rg")!.dy).toBeGreaterThan(placement.get("Rf")!.dy!);
    expect(placement.get("Rg")!.dx).toBeLessThan(0);
  });

  it("tells an input element on one side from a ground leg on the other, whichever input each is wired to", () => {
    const parts = [resistor("Rin"), resistor("Rg"), diode("D1"), opamp("U1"), ground("GND")];
    const wires: Wire[] = [
      { id: "w1", a: { partId: "Rin", terminalId: "b" }, b: { partId: "U1", terminalId: "inMinus" } },
      { id: "w2", a: { partId: "D1", terminalId: "anode" }, b: { partId: "U1", terminalId: "inMinus" } },
      { id: "w3", a: { partId: "D1", terminalId: "cathode" }, b: { partId: "U1", terminalId: "out" } },
      { id: "w4", a: { partId: "Rg", terminalId: "a" }, b: { partId: "U1", terminalId: "inPlus" } },
      { id: "w5", a: { partId: "Rg", terminalId: "b" }, b: { partId: "GND", terminalId: "gnd" } },
    ];
    const stage = detectOpAmpStage(stageInput(parts, wires, ["Rin", "Rg", "D1", "U1"]));
    expect(stage).toEqual({ opampId: "U1", inputId: "Rin", signalInput: "inMinus", feedbackIds: ["D1"], outAdjacentId: null, groundLegId: "Rg" });
    // Inverting with a ground leg on "+": the leg hangs straight under the "+" pin line, below the op-amp.
    expect(opAmpStageLayout(stage!).placement.get("Rg")).toEqual({ col: 1, row: 1, dx: -30 });
  });

  it("places a series element after the output one column past the op-amp", () => {
    const parts = [resistor("Rin"), diode("D1"), opamp("U1"), resistor("Cout")];
    const wires: Wire[] = [
      { id: "w1", a: { partId: "Rin", terminalId: "b" }, b: { partId: "U1", terminalId: "inMinus" } },
      { id: "w2", a: { partId: "D1", terminalId: "anode" }, b: { partId: "U1", terminalId: "inMinus" } },
      { id: "w3", a: { partId: "D1", terminalId: "cathode" }, b: { partId: "U1", terminalId: "out" } },
      { id: "w4", a: { partId: "Cout", terminalId: "a" }, b: { partId: "U1", terminalId: "out" } },
    ];
    const stage = detectOpAmpStage(stageInput(parts, wires, ["Rin", "D1", "U1", "Cout"]));
    expect(stage!.outAdjacentId).toBe("Cout");
    expect(opAmpStageLayout(stage!).placement.get("Cout")).toEqual({ col: 2, row: 0 });
  });

  it("bails (returns null) when a group member can't be given a role", () => {
    const parts = [resistor("Rin"), diode("D1"), opamp("U1"), resistor("Stray")];
    const wires: Wire[] = [
      { id: "w1", a: { partId: "Rin", terminalId: "b" }, b: { partId: "U1", terminalId: "inMinus" } },
      { id: "w2", a: { partId: "D1", terminalId: "anode" }, b: { partId: "U1", terminalId: "inMinus" } },
      { id: "w3", a: { partId: "D1", terminalId: "cathode" }, b: { partId: "U1", terminalId: "out" } },
      // Stray is in the group but touches none of the op-amp's own nets - unaccounted for.
    ];
    const stage = detectOpAmpStage(stageInput(parts, wires, ["Rin", "D1", "U1", "Stray"]));
    expect(stage).toBeNull();
  });

  it("bails when both inputs have a genuine (non-ground) series element - which one is 'the' input is ambiguous", () => {
    const parts = [resistor("Ra"), resistor("Rb"), diode("D1"), opamp("U1")];
    const wires: Wire[] = [
      { id: "w1", a: { partId: "Ra", terminalId: "b" }, b: { partId: "U1", terminalId: "inMinus" } },
      { id: "w2", a: { partId: "Rb", terminalId: "b" }, b: { partId: "U1", terminalId: "inPlus" } },
      { id: "w3", a: { partId: "D1", terminalId: "anode" }, b: { partId: "U1", terminalId: "inMinus" } },
      { id: "w4", a: { partId: "D1", terminalId: "cathode" }, b: { partId: "U1", terminalId: "out" } },
    ];
    const stage = detectOpAmpStage(stageInput(parts, wires, ["Ra", "Rb", "D1", "U1"]));
    expect(stage).toBeNull();
  });

  it("bails when the group doesn't contain exactly one op-amp", () => {
    const parts = [resistor("Rin"), opamp("U1"), opamp("U2")];
    const wires: Wire[] = [{ id: "w1", a: { partId: "Rin", terminalId: "b" }, b: { partId: "U1", terminalId: "inMinus" } }];
    expect(detectOpAmpStage(stageInput(parts, wires, ["Rin", "U1", "U2"]))).toBeNull();
  });
});
