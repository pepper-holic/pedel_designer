import { describe, expect, it } from "vitest";
import { generateStripboard } from "../../../src/editor/pcb/stripboard";
import { verifyStripboard } from "../../../src/editor/pcb/stripboardVerify";
import { buildBoardNetlist } from "../../../src/editor/pcb/boardNetlist";
import { netlistFromGraph } from "../../../src/editor/netlistFromGraph";
import { loadPedalPreset } from "../../../src/editor/templateLoading";
import { presets } from "../../../src/core/library/presets";

function presetBoard(index: number) {
  const { snapshot, outputNode } = loadPedalPreset(presets[index]);
  const graph = netlistFromGraph(snapshot.parts, snapshot.wires);
  const board = buildBoardNetlist(snapshot.parts, graph, outputNode);
  const partX = new Map(snapshot.parts.map((p) => [p.id, p.x]));
  return { board, partX };
}

describe("generateStripboard", () => {
  it.each(presets.map((p, i) => [p.name, i] as const))("lays out %s and the board reads back as the same circuit", (_name, index) => {
    const { board, partX } = presetBoard(index);
    const t0 = performance.now();
    const layout = generateStripboard(board, partX);
    // The plan's budget: a layout in about a second in the browser.
    expect(performance.now() - t0).toBeLessThan(3000);
    expect(verifyStripboard(layout, board).problems).toEqual([]);
  });

  it("keeps small classic circuits about the size of a hand-made layout", () => {
    // Typical published stripboard layouts are ~70 holes for an LPB-1 and ~100 for a Rangemaster;
    // the plan allows +30%.
    const size = (id: string) => {
      const { board, partX } = presetBoard(presets.findIndex((p) => p.id === id));
      const layout = generateStripboard(board, partX);
      return { holes: layout.rows * layout.cols, jumpers: layout.jumpers.length };
    };
    expect(size("lpb1-style-boost").holes).toBeLessThanOrEqual(91);
    expect(size("lpb1-style-boost").jumpers).toBe(0);
    expect(size("rangemaster-style-treble-boost").holes).toBeLessThanOrEqual(130);
  });

  it("is deterministic: the same circuit always gives the same board", () => {
    const { board, partX } = presetBoard(presets.findIndex((p) => p.id === "ts9-overdrive"));
    expect(generateStripboard(board, partX)).toEqual(generateStripboard(board, partX));
  });
});

describe("verifyStripboard", () => {
  it("catches a short, a break and a lead in a cut hole", () => {
    const { board, partX } = presetBoard(presets.findIndex((p) => p.id === "lpb1-style-boost"));
    const layout = generateStripboard(board, partX);
    // Remove every cut: strips that were separate nets now touch.
    expect(verifyStripboard({ ...layout, cuts: [] }, board).ok).toBe(layout.cuts.length === 0);
    // Cut every strip in the middle: nets spanning it break.
    const middle = Math.floor(layout.cols / 2);
    const allCut = Array.from({ length: layout.rows }, (_, row) => ({ row, col: middle }));
    const broken = verifyStripboard({ ...layout, cuts: [...layout.cuts, ...allCut] }, board);
    expect(broken.ok).toBe(false);
    // A pin dropped onto a cut hole is reported as such.
    const pin = layout.placements[0].pins[0];
    const onCut = verifyStripboard({ ...layout, cuts: [...layout.cuts, { row: pin.row, col: pin.col }] }, board);
    expect(onCut.problems.some((p) => p.includes("컷으로 뚫린 구멍"))).toBe(true);
  });
});
