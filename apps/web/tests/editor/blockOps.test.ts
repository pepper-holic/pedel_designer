import { describe, expect, it } from "vitest";
import { cloneBlocksForCopies, extractPorts, groupParts, setBlockCollapsed, ungroupBlock, pruneBlocks } from "../../src/editor/blockOps";
import { buildCanvasEndpoints } from "../../src/editor/canvasEndpoints";
import { blockToUserBlock, instantiateUserBlock, loadUserBlocks, saveUserBlocks } from "../../src/editor/userBlocks";
import { loadPedalPreset } from "../../src/editor/templateLoading";
import { netlistFromGraph } from "../../src/editor/netlistFromGraph";
import { nextFreeId } from "../../src/editor/ids";
import { presets } from "../../src/core/library/presets";
import type { CircuitSnapshot } from "../../src/editor/historyStack";

/** source -> R1 -> R2 -> R3 -> ground, laid out left to right. Grouping R2 leaves two boundary nets. */
function chain(): CircuitSnapshot {
  return {
    parts: [
      { id: "V1", type: "vsource", x: 0, y: 100, rotation: 0, params: { voltage: 0 } },
      { id: "R1", type: "resistor", x: 100, y: 100, rotation: 0, params: { resistance: 1000 } },
      { id: "R2", type: "resistor", x: 200, y: 100, rotation: 0, params: { resistance: 1000 } },
      { id: "R3", type: "resistor", x: 300, y: 100, rotation: 0, params: { resistance: 1000 } },
      { id: "G1", type: "ground", x: 0, y: 200, rotation: 0, params: {} },
      { id: "G2", type: "ground", x: 330, y: 200, rotation: 0, params: {} },
    ],
    wires: [
      { id: "w1", a: { partId: "V1", terminalId: "positive" }, b: { partId: "R1", terminalId: "a" } },
      { id: "w2", a: { partId: "R1", terminalId: "b" }, b: { partId: "R2", terminalId: "a" } },
      { id: "w3", a: { partId: "R2", terminalId: "b" }, b: { partId: "R3", terminalId: "a" } },
      { id: "w4", a: { partId: "R3", terminalId: "b" }, b: { partId: "G2", terminalId: "gnd" } },
      { id: "w5", a: { partId: "V1", terminalId: "negative" }, b: { partId: "G1", terminalId: "gnd" } },
    ],
    blocks: [],
  };
}

describe("grouping", () => {
  it("extracts the leftmost boundary net as IN and the rightmost as OUT", () => {
    const s = chain();
    const ports = extractPorts(s.parts, s.wires, new Set(["R2"]));
    expect(ports.map((p) => [p.kind, p.terminal.terminalId])).toEqual([
      ["in", "a"],
      ["out", "b"],
    ]);
  });

  it("groupParts makes a custom block and ungroup restores loose parts with wiring untouched", () => {
    const grouped = groupParts(chain(), ["R2", "R3"], { id: "blk1", label: "테스트" });
    const block = grouped.blocks[0];
    expect(block).toMatchObject({ id: "blk1", defId: null, category: "custom", collapsed: false });
    // R3's far end only reaches ground, which is never a port.
    expect(block.ports.map((p) => p.kind)).toEqual(["in"]);
    const back = ungroupBlock(grouped, "blk1");
    expect(back.blocks).toEqual([]);
    expect(back.parts.every((p) => p.blockId === undefined)).toBe(true);
    expect(back.wires).toEqual(chain().wires);
  });

  it("moving parts into a new block empties and removes their old block", () => {
    const first = groupParts(chain(), ["R2"], { id: "blk1", label: "a" });
    const second = groupParts(first, ["R2", "R3"], { id: "blk2", label: "b" });
    expect(second.blocks.map((b) => b.id)).toEqual(["blk2"]);
  });

  it("collapsing adds a port for a connection made after the block was created", () => {
    const grouped = groupParts(chain(), ["R2"], { id: "blk1", label: "a" });
    const stripped = { ...grouped, blocks: grouped.blocks.map((b) => ({ ...b, ports: b.ports.slice(0, 1) })) };
    const collapsed = setBlockCollapsed(stripped, "blk1", true);
    expect(collapsed.blocks[0].collapsed).toBe(true);
    expect(collapsed.blocks[0].ports).toHaveLength(2);
  });

  it("pruneBlocks drops ports and knobs that point at deleted parts", () => {
    const grouped = groupParts(chain(), ["R1", "R2"], { id: "blk1", label: "a" });
    const pruned = pruneBlocks({ ...grouped, parts: grouped.parts.filter((p) => p.id !== "R1") });
    expect(pruned.blocks[0].ports.every((p) => p.terminal.partId !== "R1")).toBe(true);
  });
});

describe("collapsed drawing", () => {
  it("hides internal wires, draws boundary wires to the port pins", () => {
    const s = setBlockCollapsed(groupParts(chain(), ["R2"], { id: "blk1", label: "a" }), "blk1", true);
    const graph = netlistFromGraph(s.parts, s.wires);
    const ends = buildCanvasEndpoints(s.parts, s.blocks, (r) => graph.terminalNet.get(`${r.partId}:${r.terminalId}`));
    expect(ends.hidden.has("R2")).toBe(true);
    const layout = ends.layouts.get("blk1")!;
    const inPin = layout.pins.find((p) => p.port.kind === "in")!;
    expect(ends.resolve({ partId: "R2", terminalId: "a" })).toEqual({ x: inPin.x, y: inPin.y });
    expect(inPin.x).toBeLessThan(layout.left);
  });

  it("a whole collapsed preset block keeps the circuit's netlist identical", () => {
    const preset = presets.find((p) => p.id === "ts9-overdrive")!;
    const loaded = loadPedalPreset(preset);
    const before = netlistFromGraph(loaded.snapshot.parts, loaded.snapshot.wires).netlist;
    const ids = loaded.snapshot.parts.filter((p) => p.type !== "vsource").map((p) => p.id);
    const collapsed = setBlockCollapsed(groupParts(loaded.snapshot, ids, { id: "blk1", label: "x" }), "blk1", true);
    expect(netlistFromGraph(collapsed.parts, collapsed.wires).netlist).toEqual(before);
  });
});

describe("copying blocks", () => {
  it("a block copied whole is cloned with re-pointed ports; a partial copy is not", () => {
    const s = groupParts(chain(), ["R2", "R3"], { id: "blk1", label: "a" });
    const whole = cloneBlocksForCopies(s.blocks, s.parts, new Set(["R2", "R3"]), (id) => `cp1_${id}`, "cp1");
    expect(whole.blocks).toHaveLength(1);
    expect(whole.blocks[0].ports[0].terminal.partId).toBe("cp1_R2");
    expect(whole.blockIdFor("blk1")).toBe("cp1_blk1");
    const partial = cloneBlocksForCopies(s.blocks, s.parts, new Set(["R2"]), (id) => `cp1_${id}`, "cp1");
    expect(partial.blocks).toEqual([]);
    expect(partial.blockIdFor("blk1")).toBeUndefined();
  });
});

describe("user blocks", () => {
  it("round-trips through storage and re-instantiates collapsed with fresh ids", () => {
    const s = groupParts(chain(), ["R2", "R3"], { id: "blk1", label: "내 필터" });
    const ub = blockToUserBlock(s, "blk1", "ub1", new Date("2026-10-27T00:00:00Z"))!;
    expect(ub.parts.map((p) => p.id)).toEqual(["R2", "R3"]);
    expect(ub.wires.map((w) => w.id)).toEqual(["w3"]);
    const map = new Map<string, string>();
    saveUserBlocks({ setItem: (k, v) => map.set(k, v) }, [ub]);
    const [loaded] = loadUserBlocks({ getItem: (k) => map.get(k) ?? null });
    const placed = instantiateUserBlock(loaded, "blk7", { x: 500, y: 300 });
    expect(placed.block).toMatchObject({ id: "blk7", defId: "user:ub1", collapsed: true, label: "내 필터" });
    expect(placed.parts.map((p) => p.id)).toEqual(["blk7_R2", "blk7_R3"]);
    expect(placed.block.ports[0].terminal.partId).toBe("blk7_R2");
  });

  it("skips stored entries with unknown part types instead of crashing", () => {
    const raw = JSON.stringify([{ id: "x", label: "bad", parts: [{ id: "a", type: "flux-capacitor" }], wires: [], ports: [], params: [] }]);
    expect(loadUserBlocks({ getItem: () => raw })).toEqual([]);
    expect(loadUserBlocks({ getItem: () => "{oops" })).toEqual([]);
  });
});

describe("nextFreeId", () => {
  it("never reuses an id that is already on the canvas", () => {
    expect(nextFreeId("resistor", ["resistor1", "resistor2"])).toBe("resistor3");
    expect(nextFreeId("blk", ["blk2"])).toBe("blk1");
  });
});
