import { describe, expect, it } from "vitest";
import { generatePcb } from "../../../src/editor/pcb/pcbRoute";
import { checkPcb } from "../../../src/editor/pcb/pcbDrc";
import { buildKicadPcb } from "../../../src/editor/pcb/kicadPcb";
import { pcbSvg } from "../../../src/editor/pcb/pcbDrawing";
import { courtyard, DEFAULT_RULES, type PcbLayout } from "../../../src/editor/pcb/pcbTypes";
import { buildBoardNetlist } from "../../../src/editor/pcb/boardNetlist";
import { netlistFromGraph } from "../../../src/editor/netlistFromGraph";
import { loadPedalPreset } from "../../../src/editor/templateLoading";
import { presets } from "../../../src/core/library/presets";

function presetBoard(id: string) {
  const { snapshot, outputNode } = loadPedalPreset(presets.find((p) => p.id === id)!);
  const graph = netlistFromGraph(snapshot.parts, snapshot.wires);
  const board = buildBoardNetlist(snapshot.parts, graph, outputNode);
  const partPos = new Map(snapshot.parts.map((p) => [p.id, { x: p.x, y: p.y }]));
  return { board, partPos, parts: snapshot.parts.filter((p) => p.type !== "ground").length };
}

/** Known exception to the plan's "≤2 jumpers single-sided for ≤15 parts": three single op-amps. */
const KNOWN_JUMPERS: Record<string, number> = {
  "klon-style-blend": 4,
  // Two op-amp drive stages, each now laid out as its own textbook feedback ladder (L2 of
  // docs/plan-schematic-layout.md) - a clearer schematic, but one more jumper for the single-sided
  // strip-board router than before that change.
  "multi-stage-drive": 3,
};

// Placing and routing a busy board takes a second or two - several under coverage instrumentation.
const SLOW = 60_000;

describe("generatePcb (single-sided)", () => {
  it.each(presets.map((p) => p.id))("%s routes clean, with few wire links", (id) => {
    const { board, partPos, parts } = presetBoard(id);
    const layout = generatePcb(board, partPos, DEFAULT_RULES);
    expect(checkPcb(layout, board)).toEqual([]);
    expect(layout.vias).toHaveLength(0);
    expect(layout.tracks.every((t) => t.layer === "B.Cu")).toBe(true);
    if (parts <= 15) expect(layout.links.length).toBeLessThanOrEqual(KNOWN_JUMPERS[id] ?? 2);
    // No two parts' courtyards overlap.
    const boxes = layout.components.map((c) => courtyard(c, 0));
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const overlapX = Math.min(boxes[i].maxX, boxes[j].maxX) - Math.max(boxes[i].minX, boxes[j].minX);
        const overlapY = Math.min(boxes[i].maxY, boxes[j].maxY) - Math.max(boxes[i].minY, boxes[j].minY);
        expect(overlapX > 0.01 && overlapY > 0.01, `${layout.components[i].ref} / ${layout.components[j].ref}`).toBe(false);
      }
    }
  }, SLOW);
});

describe("generatePcb (double-sided)", () => {
  it.each(["ts9-overdrive", "klon-style-blend", "king-of-tone-style-overdrive"])("%s routes every connection", (id) => {
    const { board, partPos } = presetBoard(id);
    const layout = generatePcb(board, partPos, { ...DEFAULT_RULES, singleSided: false });
    expect(layout.unrouted).toEqual([]);
    expect(layout.links).toEqual([]);
    expect(checkPcb(layout, board)).toEqual([]);
  }, SLOW);
});

describe("checkPcb", () => {
  const { board, partPos } = presetBoard("lpb1-style-boost");
  const layout = generatePcb(board, partPos, DEFAULT_RULES);

  it("finds a break when a track is missing", () => {
    const broken: PcbLayout = { ...layout, tracks: layout.tracks.slice(1) };
    expect(checkPcb(broken, board).some((i) => i.kind === "open")).toBe(true);
  });

  it("finds a short and a clearance violation when copper is moved onto another net", () => {
    const track = layout.tracks[0];
    // Drag the first track's end across the whole board: it must hit something of another net.
    const moved = { ...track, points: [...track.points.slice(0, -1), { x: layout.width / 2, y: layout.height / 2 }, { x: 4, y: layout.height - 4 }] };
    const issues = checkPcb({ ...layout, tracks: [moved, ...layout.tracks.slice(1)] }, board);
    expect(issues.some((i) => i.kind === "short" || i.kind === "clearance")).toBe(true);
  });

  it("finds copper too close to the board edge", () => {
    const track = { ...layout.tracks[0], points: [{ x: 0.2, y: 5 }, { x: 0.2, y: 10 }] };
    expect(checkPcb({ ...layout, tracks: [...layout.tracks, track] }, board).some((i) => i.kind === "edge")).toBe(true);
  });
});

describe("exports", () => {
  const { board, partPos } = presetBoard("ts9-overdrive");
  const layout = generatePcb(board, partPos, DEFAULT_RULES);

  it("writes a well-formed KiCad 8 board with every footprint, net, track and the outline", () => {
    const pcb = buildKicadPcb(layout, board);
    let depth = 0;
    for (const ch of pcb.replace(/"(?:[^"\\]|\\.)*"/g, "")) {
      if (ch === "(") depth++;
      if (ch === ")") depth--;
      expect(depth).toBeGreaterThanOrEqual(0);
    }
    expect(depth).toBe(0);
    expect(pcb).toContain("(version 20240108)");
    expect(pcb.match(/\(footprint "/g)).toHaveLength(layout.components.length);
    const segments = layout.tracks.reduce((n, t) => n + t.points.length - 1, 0);
    expect(pcb.match(/\(segment /g)?.length ?? 0).toBe(segments);
    for (const net of board.nets) expect(pcb).toContain(`(net ${board.nets.indexOf(net) + 1} "${net}")`);
    expect(pcb).toContain('(layer "Edge.Cuts")');
    for (const c of board.components) expect(pcb).toContain(`(property "Reference" "${c.ref}"`);
  });

  it("prints at true size: black copper on white for transfer, mirrored left to right", () => {
    const svg = pcbSvg(layout, board, "bottom-transfer");
    const width = Number(svg.match(/width="([\d.]+)mm"/)![1]);
    expect(width).toBeCloseTo(layout.width + 6, 6);
    expect(svg).not.toContain("#1f4d2e");
    const firstPadX = (view: "top" | "bottom-transfer") => {
      const m = pcbSvg(layout, board, view).match(/<circle cx="([\d.]+)"[^>]*fill="(#e2bf6a|#000000)"/);
      return Number(m![1]);
    };
    expect(firstPadX("top") + firstPadX("bottom-transfer")).toBeCloseTo(layout.width + 6, 3);
  });
});
