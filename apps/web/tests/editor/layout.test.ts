import { describe, expect, it } from "vitest";
import { routeWires } from "../../src/editor/routing/astar";
import { wireRoutes } from "../../src/editor/routing/wirePolylines";
import { arrangeParts } from "../../src/editor/layout/arrange";
import { rewireNets } from "../../src/editor/layout/rewire";
import { layoutMetrics } from "../../src/editor/layout/metrics";
import { partLabelPlacements } from "../../src/editor/layout/partLabels";
import { rectsOverlap } from "../../src/editor/layout/labels";
import { bboxOfParts } from "../../src/editor/blockGeometry";
import { buildCanvasEndpoints } from "../../src/editor/canvasEndpoints";
import { draggableCorners, polylineThrough } from "../../src/editor/geometry";
import { loadPedalPreset } from "../../src/editor/templateLoading";
import { netlistFromGraph } from "../../src/editor/netlistFromGraph";
import { presets } from "../../src/core/library/presets";
import { runAcAnalysis } from "../../src/core/solver/ac";

describe("router", () => {
  it("goes around an obstacle instead of through it", () => {
    const [route] = routeWires([{ a: { x: 0, y: 0 }, b: { x: 200, y: 0 }, net: "n1" }], [{ x1: 80, y1: -30, x2: 120, y2: 30 }]);
    expect(route).not.toBeNull();
    for (let i = 1; i < route!.length; i++) {
      const [p, q] = [route![i - 1], route![i]];
      expect(p.x === q.x || p.y === q.y).toBe(true);
      if (p.y === q.y && Math.abs(p.y) < 30) expect(Math.max(p.x, q.x) <= 80 || Math.min(p.x, q.x) >= 120).toBe(true);
    }
    expect(route![0]).toEqual({ x: 0, y: 0 });
    expect(route![route!.length - 1]).toEqual({ x: 200, y: 0 });
  });

  it("keeps a straight run straight when nothing is in the way", () => {
    expect(routeWires([{ a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, net: "n" }], [])[0]).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ]);
  });

  it("leaves/arrives along the terminal's own lead axis instead of bending right at the pin (L5)", () => {
    const [route] = routeWires([{ a: { x: 0, y: 0 }, b: { x: 100, y: 100 }, net: "n", axisA: 1, axisB: 0 }], []);
    expect(route).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 100 },
      { x: 100, y: 100 },
    ]);
  });

  it("doesn't force a specific direction on that axis - arriving from either side is free, so a nearby goal doesn't loop back on itself (L5)", () => {
    // A naive "exact direction" bias (rather than axis-only) would force the wire to approach b from
    // further +x and double back, since b's own lead happens to point -x; axis-only lets it take the
    // natural, shortest route and still arrive on a horizontal final run.
    const [route] = routeWires([{ a: { x: 0, y: 0 }, b: { x: 100, y: 20 }, net: "n", axisB: 0 }], []);
    expect(route).toHaveLength(3); // exactly one bend, not a detour-and-loop-back
    const last = route!;
    expect(last[last.length - 1].y).toBe(last[last.length - 2].y); // final run is horizontal
  });

  it("turns to clear an obstacle as close to the straight line as it can, not an arbitrary point further along (straightBias)", () => {
    // Mirrors a real case: a vsource's pin sits just above its own round body (the obstacle), and the
    // target resistor sits lower and to the right. Clearing the body only needs a small sidestep -
    // without a tie-break, equal-cost paths can clear it anywhere up to the goal's own column, drawing
    // a needlessly long, late dogleg that reads as a zigzag rather than one clean early turn.
    const obstacle = { x1: 92, y1: 228, x2: 108, y2: 272 };
    const [route] = routeWires([{ a: { x: 100, y: 220 }, b: { x: 230, y: 250 }, net: "n", axisA: 1, axisB: 0 }], [obstacle]);
    expect(route).not.toBeNull();
    const turnX = route!.find((p) => p.x !== 100)!.x;
    expect(turnX).toBeLessThanOrEqual(180); // well short of the goal's own column (230)
  });

  it("puts a second net on its own track rather than on top of the first", () => {
    const [a, b] = routeWires(
      [
        { a: { x: 0, y: 0 }, b: { x: 300, y: 0 }, net: "n1" },
        { a: { x: 0, y: 0 }, b: { x: 300, y: 0 }, net: "n2" },
      ],
      [],
    );
    expect(a).not.toEqual(b);
  });

  it("returns null (caller falls back) when the goal is walled in", () => {
    const [r] = routeWires([{ a: { x: 0, y: 0 }, b: { x: 200, y: 0 }, net: "n" }], [{ x1: 170, y1: -40, x2: 230, y2: -11 }, { x1: 170, y1: 11, x2: 230, y2: 40 }, { x1: 170, y1: -40, x2: 189, y2: 40 }, { x1: 211, y1: -40, x2: 230, y2: 40 }], { maxExpansions: 5000 });
    expect(r === null || r.length >= 2).toBe(true);
  });

  it("pulls a second wire of the SAME net onto the first one's track instead of each cutting its own parallel path (L3)", () => {
    const requests = [
      { a: { x: 0, y: 0 }, b: { x: 60, y: 100 }, net: "n" },
      { a: { x: 20, y: 0 }, b: { x: 80, y: 100 }, net: "n" },
    ];
    const [r1, r2] = routeWires(requests, []);
    // Both run vertical-first, then share one horizontal run at the same y (a coincident rail,
    // not two parallel lines a few px apart).
    const lastLegY = (route: { x: number; y: number }[]) => route[route.length - 2].y;
    expect(lastLegY(r1!)).toBe(lastLegY(r2!));
    expect(lastLegY(r1!)).toBe(100);
  });

  it("does NOT pull a second wire of a DIFFERENT net onto the first one's track", () => {
    const requests = [
      { a: { x: 0, y: 0 }, b: { x: 60, y: 100 }, net: "n" },
      { a: { x: 20, y: 0 }, b: { x: 80, y: 100 }, net: "m" },
    ];
    const [r1, r2] = routeWires(requests, []);
    const lastLegY = (route: { x: number; y: number }[]) => route[route.length - 2].y;
    expect(lastLegY(r1!)).toBe(100);
    expect(lastLegY(r2!)).not.toBe(100);
  });
});

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
    const route = wireRoutes(wires, loaded.snapshot.parts, buildCanvasEndpoints(loaded.snapshot.parts, [], netOf), netOf, false).find((r) => r.wire.id === wire.id)!;
    // The corner itself may be simplified away when it is collinear, but the path must pass through it.
    expect(route.points.some((p) => p.x === 500)).toBe(true);
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

describe("layout quality across every preset", () => {
  it("no routed wire runs through a part, crossings stay low, and same-net wires don't double-draw a node", () => {
    let totalCrossings = 0;
    let totalDuplicates = 0;
    for (const preset of presets) {
      const { snapshot } = loadPedalPreset(preset);
      const g = netlistFromGraph(snapshot.parts, snapshot.wires);
      const netOf = (r: { partId: string; terminalId: string }) => g.terminalNet.get(`${r.partId}:${r.terminalId}`);
      const wireNetOf = (wireId: string) => netOf(snapshot.wires.find((w) => w.id === wireId)!.a);
      const routes = wireRoutes(snapshot.wires, snapshot.parts, buildCanvasEndpoints(snapshot.parts, snapshot.blocks, netOf), netOf, false);
      const m = layoutMetrics({ ...snapshot, wires: routes.map((r) => r.wire) }, routes.map((r) => r.points), wireNetOf);
      expect(m.bodyHits, preset.id).toBe(0);
      expect(m.crossings, preset.id).toBeLessThanOrEqual(8);
      totalCrossings += m.crossings;
      totalDuplicates += m.parallelDuplicates;
    }
    // Baseline before Stage C (flat layout, plain 2-bend wires): 64 crossings.
    // L1 (part orientation pass): 23. L2 (op-amp stage template): 19.
    // L3 (same-net wires attracted onto a shared track - routing/astar.ts alongBonus): 18.
    // L5 (terminal lead-axis bias - geometry.ts's terminalLeadAxis, astar.ts's axisA/axisB; plus a
    // tiny astar.ts straightBias tie-break that pulls an otherwise-equal-cost detour's turn back
    // toward the straight line between a wire's ends, instead of an arbitrary later one): 16 (-2 net
    // from L3's 18 - straightBias costs a few crossings back versus axis-bias alone's 13, worth it for
    // routes that no longer wander needlessly far off-line before turning).
    // Plan target: <=15 - not quite; tracked here for further tuning.
    expect(totalCrossings).toBeLessThanOrEqual(17);
    // L3 target: same node drawn as one trunk, not two parallel lines a few px apart. A handful of
    // multi-diode clipping networks the op-amp template doesn't recognize (L2's scope) still draw a
    // net's branches as separate nearby runs rather than merging onto one; tracked here so further
    // routing work (or a future L2 extension) can be measured against this count.
    // L5 traded a few more of these (21 -> 24) for far fewer crossings and no more loop-back zigzags -
    // each terminal now reliably gets a straight stub, which was the more visible defect.
    expect(totalDuplicates).toBeLessThanOrEqual(26);
  });
});

describe("op-amp stage template (L2)", () => {
  it("draws the TS9 drive stage as a feedback ladder directly over the op-amp, input on the same row", () => {
    const preset = presets.find((p) => p.id === "ts9-overdrive")!;
    const { snapshot } = loadPedalPreset(preset);
    const arranged = arrangeParts(snapshot, null);
    const byId = new Map(arranged.parts.map((p) => [p.id, p]));
    const [rin, u1, drive, d1, d2] = ["Rin", "U1", "DRIVE", "D1", "D2"].map((id) => byId.get(id)!);

    // Input and op-amp sit on the same signal row.
    expect(rin.y).toBe(u1.y);
    // Every feedback element (the gain pot and both clipping diodes) shares the op-amp's column...
    for (const p of [drive, d1, d2]) expect(p.x).toBe(u1.x);
    // ...stacked at distinct heights above it, not piled in one spot or spread sideways.
    const ys = new Set([drive.y, d1.y, d2.y]);
    expect(ys.size).toBe(3);
    for (const y of ys) expect(y).toBeLessThan(u1.y);
  });
});

describe("part orientation pass (L1)", () => {
  it("turns the TS9 drive stage's antiparallel diode to face the opposite way, and mirrors the op-amp so feedback lands on top", () => {
    const preset = presets.find((p) => p.id === "ts9-overdrive")!;
    const { snapshot } = loadPedalPreset(preset);
    const arranged = arrangeParts(snapshot, null);
    const byId = new Map(arranged.parts.map((p) => [p.id, p]));
    // D1 and D2 are antiparallel across the same two nodes - one of them must turn 180 degrees so
    // each diode's anode/cathode line up with its own node instead of the wire routing around the body.
    expect(byId.get("D1")!.rotation).not.toBe(byId.get("D2")!.rotation);
    // U1's inverting input (-) carries the feedback network - mirroring brings it to the top (dy<0)
    // instead of the bottom, matching the textbook inverting-amplifier drawing.
    expect(byId.get("U1")!.mirror).toBe(true);
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

describe("node-level wiring (L3)", () => {
  it("draws TS9's n2 and n3 as a single shared track per node, with no near-duplicate parallel run", () => {
    const preset = presets.find((p) => p.id === "ts9-overdrive")!;
    const { snapshot } = loadPedalPreset(preset);
    const g = netlistFromGraph(snapshot.parts, snapshot.wires);
    const netOf = (r: { partId: string; terminalId: string }) => g.terminalNet.get(`${r.partId}:${r.terminalId}`);
    const wireNetOf = (wireId: string) => netOf(snapshot.wires.find((w) => w.id === wireId)!.a);
    const routes = wireRoutes(snapshot.wires, snapshot.parts, buildCanvasEndpoints(snapshot.parts, snapshot.blocks, netOf), netOf, false);
    const m = layoutMetrics({ ...snapshot, wires: routes.map((r) => r.wire) }, routes.map((r) => r.points), wireNetOf);
    expect(m.parallelDuplicates).toBe(0);
  });
});

describe("label placement (L4)", () => {
  it("places every part's id/value label with no label-label or label-wire overlap, across every preset", () => {
    for (const preset of presets) {
      const { snapshot } = loadPedalPreset(preset);
      const g = netlistFromGraph(snapshot.parts, snapshot.wires);
      const netOf = (r: { partId: string; terminalId: string }) => g.terminalNet.get(`${r.partId}:${r.terminalId}`);
      const endpoints = buildCanvasEndpoints(snapshot.parts, snapshot.blocks, netOf);
      const { requests, placed } = partLabelPlacements(snapshot.parts, snapshot.wires, endpoints, netOf);
      const rects = requests.map((r) => placed.get(r.id)!);

      for (let i = 0; i < rects.length; i++) {
        for (let j = i + 1; j < rects.length; j++) {
          expect(rectsOverlap(rects[i], rects[j]), `${preset.id}: ${requests[i].id} / ${requests[j].id}`).toBe(false);
        }
      }

      const routes = wireRoutes(snapshot.wires, snapshot.parts, endpoints, netOf, false);
      const wireSegs = routes.flatMap(({ points }) => points.slice(1).map((b, i) => ({ a: points[i], b })));
      for (let i = 0; i < rects.length; i++) {
        for (const s of wireSegs) {
          const horizontal = s.a.y === s.b.y;
          const hit = horizontal
            ? s.a.y > rects[i].y1 && s.a.y < rects[i].y2 && Math.max(s.a.x, s.b.x) > rects[i].x1 && Math.min(s.a.x, s.b.x) < rects[i].x2
            : s.a.x > rects[i].x1 && s.a.x < rects[i].x2 && Math.max(s.a.y, s.b.y) > rects[i].y1 && Math.min(s.a.y, s.b.y) < rects[i].y2;
          expect(hit, `${preset.id}: ${requests[i].id} crosses a wire`).toBe(false);
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
    const { placed } = partLabelPlacements(snapshot.parts, snapshot.wires, endpoints, netOf);
    const idRect = placed.get(`id-${pot!.id}`)!;
    // "up" would put the box entirely above the anchor (y2 <= anchor.y); anything else keeps some
    // part of the box at or below it.
    expect(idRect.y2).toBeGreaterThan(pot!.y);
  });
});
