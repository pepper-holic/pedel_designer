import { describe, expect, it } from "vitest";
import { netlistFromGraph } from "../../src/editor/netlistFromGraph";
import { SWITCH_ON_OHMS, SWITCH_OFF_OHMS } from "../../src/editor/partDefs";
import type { PartInstance, Wire } from "../../src/editor/types";
import type { ResistorElement } from "../../src/core/solver/types";

const noWires: Wire[] = [];

function resistorsOf(parts: PartInstance[]): ResistorElement[] {
  return netlistFromGraph(parts, noWires).netlist.elements.filter((e): e is ResistorElement => e.type === "resistor");
}

/** Switches are stamped as plain resistors - a near-short when closed, a near-open when not - so the
 * solver never needs to know they exist (docs/plan-guitar-wiring.md §3). */
describe("switch parts", () => {
  it("stamps an SPST as one resistor that is open or shorted by its position", () => {
    const open = resistorsOf([{ id: "SW", type: "spst", x: 0, y: 0, rotation: 0, params: { switchPosition: 0 } }]);
    const closed = resistorsOf([{ id: "SW", type: "spst", x: 0, y: 0, rotation: 0, params: { switchPosition: 1 } }]);

    expect(open).toHaveLength(1);
    expect(open[0].resistance).toBe(SWITCH_OFF_OHMS);
    expect(closed[0].resistance).toBe(SWITCH_ON_OHMS);
  });

  it("connects an SPDT's common to exactly one throw at a time", () => {
    for (const position of [0, 1]) {
      const rs = resistorsOf([{ id: "SW", type: "spdt", x: 0, y: 0, rotation: 0, params: { switchPosition: position } }]);
      expect(rs).toHaveLength(2);
      expect(rs.filter((r) => r.resistance === SWITCH_ON_OHMS)).toHaveLength(1);
      expect(rs.filter((r) => r.resistance === SWITCH_OFF_OHMS)).toHaveLength(1);
      // The closed one must be the throw matching the position.
      const closed = rs.find((r) => r.resistance === SWITCH_ON_OHMS)!;
      expect(closed.id).toBe(position === 0 ? "SW:p1a" : "SW:p1b");
    }
  });

  it("switches both poles of a DPDT together", () => {
    for (const position of [0, 1]) {
      const rs = resistorsOf([{ id: "SW", type: "spdt", x: 0, y: 0, rotation: 0, params: { switchPosition: position } }]);
      expect(rs).toHaveLength(2);
    }
    for (const position of [0, 1]) {
      const rs = resistorsOf([{ id: "SW", type: "dpdt", x: 0, y: 0, rotation: 0, params: { switchPosition: position } }]);
      expect(rs).toHaveLength(4);
      const closedIds = rs.filter((r) => r.resistance === SWITCH_ON_OHMS).map((r) => r.id).sort();
      // Both poles follow the same lever, so pole 1 and pole 2 close on the same side.
      expect(closedIds).toEqual(position === 0 ? ["SW:p1a", "SW:p2a"] : ["SW:p1b", "SW:p2b"]);
    }
  });

  it("treats any out-of-range position as the first position rather than producing a dead switch", () => {
    const rs = resistorsOf([{ id: "SW", type: "spdt", x: 0, y: 0, rotation: 0, params: { switchPosition: 7 } }]);
    expect(rs.filter((r) => r.resistance === SWITCH_ON_OHMS)).toHaveLength(1);
  });
});
