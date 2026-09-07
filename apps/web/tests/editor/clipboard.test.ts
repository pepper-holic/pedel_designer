import { describe, expect, it } from "vitest";
import { cloneSelection, partsInBox } from "../../src/editor/selection";
import type { PartInstance, Wire } from "../../src/editor/types";

const parts: PartInstance[] = [
  { id: "R1", type: "resistor", x: 100, y: 100, rotation: 0, params: { resistance: 1000 } },
  { id: "C1", type: "capacitor", x: 200, y: 100, rotation: 90, params: { capacitance: 1e-6 } },
  { id: "G1", type: "ground", x: 400, y: 400, rotation: 0, params: {} },
];
const wires: Wire[] = [
  { id: "w1", a: { partId: "R1", terminalId: "b" }, b: { partId: "C1", terminalId: "a" } },
  { id: "w2", a: { partId: "C1", terminalId: "b" }, b: { partId: "G1", terminalId: "gnd" } },
];

describe("partsInBox", () => {
  it("selects the parts whose bodies fall inside the rectangle", () => {
    expect(partsInBox(parts, { x1: 50, y1: 50, x2: 250, y2: 150 }).sort()).toEqual(["C1", "R1"]);
  });

  it("normalises a box dragged up-and-left", () => {
    expect(partsInBox(parts, { x1: 250, y1: 150, x2: 50, y2: 50 }).sort()).toEqual(["C1", "R1"]);
  });

  it("selects nothing for an empty region", () => {
    expect(partsInBox(parts, { x1: 600, y1: 600, x2: 700, y2: 700 })).toEqual([]);
  });
});

describe("cloneSelection", () => {
  it("copies the chosen parts with fresh ids and an offset", () => {
    const { parts: copied } = cloneSelection(parts, wires, ["R1", "C1"], { dx: 20, dy: 20 }, "cp");

    expect(copied.map((p) => p.id)).toEqual(["cp_R1", "cp_C1"]);
    expect(copied[0].x).toBe(120);
    expect(copied[1].rotation).toBe(90);
    // Params must be deep-copied, or editing the copy would edit the original.
    copied[0].params.resistance = 9999;
    expect(parts[0].params.resistance).toBe(1000);
  });

  it("keeps wires that are entirely inside the selection and drops the ones that leave it", () => {
    const { wires: copied } = cloneSelection(parts, wires, ["R1", "C1"], { dx: 0, dy: 0 }, "cp");

    // w1 is R1<->C1 (both copied); w2 goes to G1, which was not selected, so it has nowhere to land.
    expect(copied).toHaveLength(1);
    expect(copied[0].a.partId).toBe("cp_R1");
    expect(copied[0].b.partId).toBe("cp_C1");
  });

  it("ignores ids that are not on the canvas", () => {
    const { parts: copied } = cloneSelection(parts, wires, ["R1", "GONE"], { dx: 0, dy: 0 }, "cp");
    expect(copied.map((p) => p.id)).toEqual(["cp_R1"]);
  });
});
