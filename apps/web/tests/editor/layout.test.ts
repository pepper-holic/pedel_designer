import { describe, expect, it } from "vitest";
import { wireRoutes } from "../../src/editor/routing/wirePolylines";
import { arrangeParts, rowAnchorOffset } from "../../src/editor/layout/arrange";
import { rewireNets } from "../../src/editor/layout/rewire";
import { partLabelPlacements } from "../../src/editor/layout/partLabels";
import { rectsOverlap } from "../../src/editor/layout/labels";
import { bboxOfParts } from "../../src/editor/blockGeometry";
import { buildCanvasEndpoints } from "../../src/editor/canvasEndpoints";
import { draggableCorners, insertCorner, polylineThrough, terminalPosition } from "../../src/editor/geometry";
import { loadPedalPreset } from "../../src/editor/templateLoading";
import { netlistFromGraph } from "../../src/editor/netlistFromGraph";
import { presets } from "../../src/core/library/presets";
import { runAcAnalysis } from "../../src/core/solver/ac";
import type { PartInstance } from "../../src/editor/types";

describe("waypoints", () => {
  it("polylineThrough stays orthogonal and ends with a horizontal leg into the terminal", () => {
    const pts = polylineThrough({ x: 0, y: 0 }, [{ x: 50, y: 80 }], { x: 120, y: 40 });
    for (let i = 1; i < pts.length; i++) expect(pts[i - 1].x === pts[i].x || pts[i - 1].y === pts[i].y).toBe(true);
    const [p, q] = pts.slice(-2);
    expect(p.y).toBe(q.y);
  });

  it("draggableCorners gives a straight wire an inner segment to grab", () => {
    expect(draggableCorners([{ x: 0, y: 0 }, { x: 200, y: 0 }])).toHaveLength(4);
    expect(draggableCorners([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }])).toHaveLength(4);
  });

  it("a wire with waypoints is drawn through them instead of being routed", () => {
    const loaded = loadPedalPreset(presets.find((p) => p.id === "diode-clipper")!);
    const wire = loaded.snapshot.wires.find((w) => w.a.partId !== w.b.partId && !w.a.partId.startsWith("GND") && !w.b.partId.startsWith("GND"))!;
    const wires = loaded.snapshot.wires.map((w) => (w.id === wire.id ? { ...w, waypoints: [{ x: 500, y: 500 }] } : w));
    const g = netlistFromGraph(loaded.snapshot.parts, wires);
    const netOf = (r: { partId: string; terminalId: string }) => g.terminalNet.get(`${r.partId}:${r.terminalId}`);
    const route = wireRoutes(wires, buildCanvasEndpoints(loaded.snapshot.parts, [], netOf)).find((r) => r.wire.id === wire.id)!;
    // The corner itself may be simplified away when it is collinear, but the path must pass through it.
    expect(route.points.some((p) => p.x === 500)).toBe(true);
  });

  it("insertCorner splits the clicked segment into a real dogleg, keeping both ends fixed and every leg orthogonal", () => {
    const corners = [{ x: 0, y: 0 }, { x: 200, y: 0 }];
    const next = insertCorner(corners, { x: 100, y: 5 });
    expect(next).not.toBe(corners);
    expect(next[0]).toEqual({ x: 0, y: 0 });
    expect(next[next.length - 1]).toEqual({ x: 200, y: 0 });
    for (let i = 1; i < next.length; i++) expect(next[i - 1].x === next[i].x || next[i - 1].y === next[i].y).toBe(true);
    // More than the original 2 points - a real bend was added, not a collinear no-op.
    expect(next.length).toBeGreaterThan(2);
  });

  it("insertCorner is a no-op on a degenerate zero-length segment", () => {
    const corners = [{ x: 100, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 0 }];
    expect(insertCorner(corners, { x: 100, y: 0 })).toBe(corners);
  });

  it("insertCorner picks whichever segment the click actually landed closest to", () => {
    const corners = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }];
    const next = insertCorner(corners, { x: 100, y: 50 }); // on the vertical leg
    // The horizontal leg (0,0)-(100,0) is untouched - still present as the first two points.
    expect(next[0]).toEqual({ x: 0, y: 0 });
    expect(next[1]).toEqual({ x: 100, y: 0 });
    expect(next[next.length - 1]).toEqual({ x: 100, y: 100 });
  });

  it("repeated insertCorner calls build up multiple draggable corners, not just one", () => {
    const once = insertCorner([{ x: 0, y: 0 }, { x: 300, y: 0 }], { x: 150, y: 0 });
    const twice = insertCorner(once, { x: 20, y: 0 });
    expect(draggableCorners(twice).length).toBeGreaterThan(draggableCorners(once).length);
  });
});

describe("arrange", () => {
  const big = presets.find((p) => p.id === "big-muff-style-fuzz")!;

  it("places blocks without overlapping and in signal order", () => {
    const { snapshot } = loadPedalPreset(big);
    const boxes = snapshot.blocks.map((b) => ({ b, box: bboxOfParts(snapshot.parts.filter((p) => p.blockId === b.id && p.type !== "ground"))! }));
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const [p, q] = [boxes[i].box, boxes[j].box];
        const overlap = p.minX < q.maxX && q.minX < p.maxX && p.minY < q.maxY && q.minY < p.maxY;
        expect(overlap, `${boxes[i].b.id} overlaps ${boxes[j].b.id}`).toBe(false);
      }
    const x = (id: string) => boxes.find((b) => b.b.id === id)!.box.minX;
    expect(x("stage1")).toBeLessThan(x("stage2"));
    expect(x("stage2")).toBeLessThan(x("tone"));
    expect(x("tone")).toBeLessThan(x("output"));
  });

  it("leaves pinned parts where they are and keeps the circuit electrically identical", () => {
    const { snapshot } = loadPedalPreset(big);
    const pinned = { ...snapshot, parts: snapshot.parts.map((p) => (p.id === "Q1" ? { ...p, x: 9990, y: 9990, pinned: true } : p)) };
    const arranged = rewireNets(arrangeParts(pinned, "V1"));
    expect(arranged.parts.find((p) => p.id === "Q1")).toMatchObject({ x: 9990, y: 9990 });
    const before = netlistFromGraph(pinned.parts, pinned.wires);
    const after = netlistFromGraph(arranged.parts, arranged.wires);
    const ac = (g: typeof before, out: string) => runAcAnalysis(g.netlist, { inputSourceId: "V1", outputNode: out, frequenciesHz: [100, 1000] }).map((p) => p.magnitudeDb);
    const outBefore = before.terminalNet.get("Rload:a")!;
    const outAfter = after.terminalNet.get("Rload:a")!;
    ac(after, outAfter).forEach((v, i) => expect(v).toBeCloseTo(ac(before, outBefore)[i], 6));
  });
});

describe("op-amp stage template (L2)", () => {
  it("draws the TS9 drive stage with the gain pot over the op-amp and the diode pair in a column of their own", () => {
    const preset = presets.find((p) => p.id === "ts9-overdrive")!;
    const { snapshot } = loadPedalPreset(preset);
    const byId = new Map(snapshot.parts.map((p) => [p.id, p]));
    const [rin, u1, drive, d1, d2] = ["Rin", "U1", "DRIVE", "D1", "D2"].map((id) => byId.get(id)!);

    // Input and op-amp sit on the same signal row.
    expect(rin.y).toBe(u1.y);
    // The gain pot (not a diode) stays directly over the op-amp...
    expect(drive.x).toBe(u1.x);
    expect(drive.y).toBeLessThan(u1.y);
    // ...while the antiparallel clipping pair gets its own column, so the block spends width instead
    // of piling every feedback element into one ever-taller tower.
    expect(d1.x).toBe(d2.x);
    expect(d1.x).not.toBe(u1.x);
    expect(d1.y).not.toBe(d2.y);
    expect(d1.y).toBeLessThan(u1.y);
    expect(d2.y).toBeLessThan(u1.y);
  });
});

describe("part orientation pass (L1)", () => {
  it("turns the TS9 drive stage's antiparallel diode to face the opposite way", () => {
    const preset = presets.find((p) => p.id === "ts9-overdrive")!;
    // loadPedalPreset already runs arrangeParts once (with the preset's real input source) - rerunning
    // it on its own (already rewired) output is a different, unrealistic input and does not reflect
    // what the app actually draws, so this checks the single real pass's result directly.
    const { snapshot } = loadPedalPreset(preset);
    const byId = new Map(snapshot.parts.map((p) => [p.id, p]));
    // D1 and D2 are antiparallel across the same two nodes - one of them must turn 180 degrees so
    // each diode's anode/cathode line up with its own node instead of the wire routing around the body.
    expect(byId.get("D1")!.rotation).not.toBe(byId.get("D2")!.rotation);
  });

  it("does not touch a pinned part's orientation even when it would score better", () => {
    const preset = presets.find((p) => p.id === "ts9-overdrive")!;
    const { snapshot } = loadPedalPreset(preset);
    const pinned = { ...snapshot, parts: snapshot.parts.map((p) => (p.id === "D2" ? { ...p, pinned: true } : p)) };
    const arranged = arrangeParts(pinned, null);
    const original = pinned.parts.find((p) => p.id === "D2")!;
    const after = arranged.parts.find((p) => p.id === "D2")!;
    expect(after.rotation).toBe(original.rotation);
    expect(after.mirror).toBe(original.mirror);
  });
});

describe("row-anchored source placement (L6)", () => {
  it("shifts a signal vsource PAST the row, so its own pin ends up on the far side from its body", () => {
    const preset = presets.find((p) => p.id === "rat-style-distortion")!;
    const { snapshot } = loadPedalPreset(preset);
    const arranged = arrangeParts(snapshot, "V1");
    const byId = new Map(arranged.parts.map((p) => [p.id, p]));
    const v1 = byId.get("V1")!;
    const rin = byId.get("Rin")!;
    // The pin sits BELOW Rin's row (overshooting flush), not above it - so the wire runs away from
    // V1's own body on its way up to the row, instead of toward it.
    const gap = terminalPosition(v1, "positive").y - terminalPosition(rin, "a").y;
    expect(gap).toBeGreaterThan(0);
    expect(gap).toBeLessThan(30);
  });

  it("leaves a power/bias source's own centre on the row - it isn't part of the signal spine", () => {
    const supply: PartInstance = { id: "Vcc", type: "vsource", x: 0, y: 0, rotation: 0, role: "supply", params: { voltage: 9 } };
    const bias: PartInstance = { id: "Vbias", type: "vsource", x: 0, y: 0, rotation: 0, role: "bias", params: { voltage: 4.5 } };
    const signal: PartInstance = { id: "V1", type: "vsource", x: 0, y: 0, rotation: 0, params: { voltage: 0 } };
    expect(rowAnchorOffset(supply)).toBe(0);
    expect(rowAnchorOffset(bias)).toBe(0);
    expect(rowAnchorOffset(signal)).not.toBe(0);
  });
});

describe("label placement (L4)", () => {
  // Labels are placed to dodge wires too, but that's only a best-effort nudge against the fixed
  // 2-bend route - unlike part bodies, a wire isn't guaranteed obstacle-free since there's no
  // router left to reroute it around a label. Only label-label overlap is a hard guarantee.
  it("places every part's id/value label with no label-label overlap, across every preset", () => {
    for (const preset of presets) {
      const { snapshot } = loadPedalPreset(preset);
      const g = netlistFromGraph(snapshot.parts, snapshot.wires);
      const netOf = (r: { partId: string; terminalId: string }) => g.terminalNet.get(`${r.partId}:${r.terminalId}`);
      const endpoints = buildCanvasEndpoints(snapshot.parts, snapshot.blocks, netOf);
      const { requests, placed } = partLabelPlacements(snapshot.parts, snapshot.wires, endpoints);
      const rects = requests.map((r) => placed.get(r.id)!);

      for (let i = 0; i < rects.length; i++) {
        for (let j = i + 1; j < rects.length; j++) {
          expect(rectsOverlap(rects[i], rects[j]), `${preset.id}: ${requests[i].id} / ${requests[j].id}`).toBe(false);
        }
      }
    }
  });

  it("gives a potentiometer's label somewhere other than straight up, where its wiper indicator is drawn", () => {
    const preset = presets.find((p) => p.id === "ts9-overdrive")!;
    const { snapshot } = loadPedalPreset(preset);
    const pot = snapshot.parts.find((p) => p.type === "potentiometer");
    expect(pot).toBeDefined();
    const g = netlistFromGraph(snapshot.parts, snapshot.wires);
    const netOf = (r: { partId: string; terminalId: string }) => g.terminalNet.get(`${r.partId}:${r.terminalId}`);
    const endpoints = buildCanvasEndpoints(snapshot.parts, snapshot.blocks, netOf);
    const { placed } = partLabelPlacements(snapshot.parts, snapshot.wires, endpoints);
    const idRect = placed.get(`id-${pot!.id}`)!;
    // "up" would put the box entirely above the anchor (y2 <= anchor.y); anything else keeps some
    // part of the box at or below it.
    expect(idRect.y2).toBeGreaterThan(pot!.y);
  });
});
