import { describe, expect, it } from "vitest";
import { netlistFromGraph } from "../../src/editor/netlistFromGraph";
import { SWITCH_ON_OHMS } from "../../src/editor/partDefs";
import type { PartInstance, Wire } from "../../src/editor/types";
import type { PartType } from "../../src/editor/partDefs";
import type { ResistorElement } from "../../src/core/solver/types";

const noWires: Wire[] = [];

/** Which input indices (1-based, matching the terminal ids) the blade connects at each position. */
function connectedInputs(type: PartType, switchPosition: number): number[] {
  const parts: PartInstance[] = [{ id: "SW", type, x: 0, y: 0, rotation: 0, params: { switchPosition } }];
  return netlistFromGraph(parts, noWires)
    .netlist.elements.filter((e): e is ResistorElement => e.type === "resistor" && e.resistance === SWITCH_ON_OHMS)
    .map((e) => Number(e.id.replace("SW:in", "")))
    .sort((a, b) => a - b);
}

/**
 * A guitar blade selector is not a 1-of-N switch: its odd-numbered positions bridge two adjacent
 * contacts at once, which is exactly where the in-between pickup combinations come from.
 */
describe("blade selectors", () => {
  it("gives a 3-way the neck / both / bridge pattern", () => {
    expect(connectedInputs("blade3", 0)).toEqual([1]);
    expect(connectedInputs("blade3", 1)).toEqual([1, 2]);
    expect(connectedInputs("blade3", 2)).toEqual([2]);
  });

  it("gives a 5-way the five Stratocaster-style positions", () => {
    expect(connectedInputs("blade5", 0)).toEqual([1]);
    expect(connectedInputs("blade5", 1)).toEqual([1, 2]);
    expect(connectedInputs("blade5", 2)).toEqual([2]);
    expect(connectedInputs("blade5", 3)).toEqual([2, 3]);
    expect(connectedInputs("blade5", 4)).toEqual([3]);
  });

  it("stamps one contact per input regardless of position", () => {
    for (const position of [0, 1, 2, 3, 4]) {
      const parts: PartInstance[] = [{ id: "SW", type: "blade5", x: 0, y: 0, rotation: 0, params: { switchPosition: position } }];
      const rs = netlistFromGraph(parts, noWires).netlist.elements.filter((e) => e.type === "resistor");
      expect(rs).toHaveLength(3);
    }
  });

  it("falls back to the first position when the stored position is out of range", () => {
    expect(connectedInputs("blade5", 9)).toEqual([1]);
    expect(connectedInputs("blade3", -1)).toEqual([1]);
  });
});
