import { describe, expect, it } from "vitest";
import { coerceParamValue, deleteBlock, deleteParts, mirrorPart, movePartsBy, rotatePart, updatePartParams } from "../../src/editor/circuitEdits";
import type { CircuitSnapshot } from "../../src/editor/historyStack";

const snapshot: CircuitSnapshot = {
  parts: [
    { id: "R1", type: "resistor", x: 0, y: 0, rotation: 0, params: { resistance: 1000 } },
    { id: "blk1_R1", type: "resistor", x: 100, y: 0, rotation: 0, params: { resistance: 1000 }, blockId: "blk1" },
    { id: "blk1_C1", type: "capacitor", x: 200, y: 0, rotation: 0, params: { capacitance: 1e-9 }, blockId: "blk1" },
  ],
  wires: [
    { id: "w1", a: { partId: "R1", terminalId: "b" }, b: { partId: "blk1_R1", terminalId: "a" } },
    { id: "w2", a: { partId: "blk1_R1", terminalId: "b" }, b: { partId: "blk1_C1", terminalId: "a" } },
  ],
  blocks: [{ id: "blk1", defId: "tone-stack-passive", label: "톤", category: "tone", ports: [], params: [], collapsed: false }],
};

describe("circuitEdits", () => {
  it("deleteBlock also removes wires from outside into the block", () => {
    const next = deleteBlock(snapshot, "blk1");
    expect(next.parts.map((p) => p.id)).toEqual(["R1"]);
    expect(next.wires).toEqual([]);
    expect(next.blocks).toEqual([]);
  });

  it("deleteParts drops a block once its last part is gone", () => {
    const next = deleteParts(snapshot, ["blk1_R1", "blk1_C1"]);
    expect(next.blocks).toEqual([]);
    const partial = deleteParts(snapshot, ["blk1_C1"]);
    expect(partial.blocks).toHaveLength(1);
    expect(partial.wires.map((w) => w.id)).toEqual(["w1"]);
  });

  it("movePartsBy moves only the listed parts", () => {
    const next = movePartsBy(snapshot, ["R1"], 10, -20);
    expect(next.parts[0]).toMatchObject({ x: 10, y: -20 });
    expect(next.parts[1]).toMatchObject({ x: 100, y: 0 });
  });

  it("rotatePart and updatePartParams touch only their part", () => {
    expect(rotatePart(snapshot, "R1").parts[0].rotation).toBe(90);
    expect(updatePartParams(snapshot, "R1", { resistance: 22 }).parts.map((p) => p.params.resistance)).toEqual([22, 1000, undefined]);
  });

  it("mirrorPart toggles only its part's mirror flag", () => {
    const once = mirrorPart(snapshot, "R1");
    expect(once.parts[0].mirror).toBe(true);
    expect(once.parts[1].mirror).toBeUndefined();
    expect(mirrorPart(once, "R1").parts[0].mirror).toBe(false);
  });

  it("coerceParamValue parses numbers, clamps to a minimum, and keeps text", () => {
    expect(coerceParamValue("resistance", "4700")).toBe(4700);
    expect(coerceParamValue("resistance", "-5")).toBeGreaterThan(0);
    expect(coerceParamValue("taper", "log")).toBe("log");
    expect(coerceParamValue("resistance", "  ")).toBe("  ");
  });
});
