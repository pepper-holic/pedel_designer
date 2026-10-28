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

const isDiodeOf = (parts: PartInstance[]) => (id: string) => parts.find((p) => p.id === id)?.type === "diode";

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
    expect(stage).toEqual({ opampId: "U1", inputId: "Rin", feedbackIds: ["D1"], outAdjacentId: null, groundLegId: null });

    const placement = opAmpStageLayout(stage!, isDiodeOf(parts));
    expect(placement.get("Rin")).toEqual({ col: 0, row: 0 });
    expect(placement.get("U1")).toEqual({ col: 1, row: 0 });
    expect(placement.get("D1")).toEqual({ col: 1, row: -1 });
  });

  it("keeps a diode clipping pair stacked together in their own column, apart from a non-diode feedback element", () => {
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

    const placement = opAmpStageLayout(stage!, isDiodeOf(parts));
    // Rf (the gain-setting element) stays in the op-amp's own column...
    expect(placement.get("Rf")).toEqual({ col: 1, row: -1 });
    // ...while D1/D2 (the antiparallel clipping pair) get a column of their own, stacked together.
    expect(placement.get("D1")).toEqual({ col: 2, row: -1 });
    expect(placement.get("D2")).toEqual({ col: 2, row: -2 });
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
    expect(stage).toEqual({ opampId: "U1", inputId: null, feedbackIds: ["Rf"], outAdjacentId: null, groundLegId: "Rg" });

    const placement = opAmpStageLayout(stage!, isDiodeOf(parts));
    expect(placement.get("U1")).toEqual({ col: 0, row: 0 });
    expect(placement.get("Rg")).toEqual({ col: 0, row: 1 });
    expect(placement.get("Rf")).toEqual({ col: 0, row: -1 });
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
    expect(stage).toEqual({ opampId: "U1", inputId: "Rin", feedbackIds: ["D1"], outAdjacentId: null, groundLegId: "Rg" });
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
    expect(opAmpStageLayout(stage!, isDiodeOf(parts)).get("Cout")).toEqual({ col: 2, row: 0 });
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
