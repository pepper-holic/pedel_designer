import { describe, expect, it } from "vitest";
import { snapToGrid, rotateClockwise, rotateOffset, terminalPosition, orthogonalPath, computeWirePaths, zoomAroundPoint, fitView, GRID_SIZE } from "../../src/editor/geometry";
import type { PartInstance } from "../../src/editor/types";
import type { Point } from "../../src/editor/geometry";

describe("snapToGrid", () => {
  it("rounds to the nearest grid step", () => {
    expect(snapToGrid(4)).toBe(0);
    expect(snapToGrid(6)).toBe(GRID_SIZE);
    expect(snapToGrid(123)).toBe(120);
  });
});

describe("rotateClockwise", () => {
  it("cycles through the four 90-degree steps", () => {
    expect(rotateClockwise(0)).toBe(90);
    expect(rotateClockwise(90)).toBe(180);
    expect(rotateClockwise(180)).toBe(270);
    expect(rotateClockwise(270)).toBe(0);
  });
});

describe("rotateOffset", () => {
  it("rotates a point 90 degrees clockwise (SVG y-down convention)", () => {
    const { x, y } = rotateOffset(10, 0, 90);
    expect(x).toBeCloseTo(0, 9);
    expect(y).toBeCloseTo(10, 9);
  });

  it("leaves a point unchanged at 0 degrees", () => {
    const { x, y } = rotateOffset(7, -3, 0);
    expect(x).toBeCloseTo(7, 9);
    expect(y).toBeCloseTo(-3, 9);
  });
});

describe("terminalPosition", () => {
  it("applies the part's rotation to its terminal offsets", () => {
    const part: PartInstance = { id: "R1", type: "resistor", x: 100, y: 100, rotation: 90, params: { resistance: 1000 } };
    const pos = terminalPosition(part, "b"); // local offset (30, 0)
    expect(pos.x).toBeCloseTo(100, 9);
    expect(pos.y).toBeCloseTo(130, 9);
  });

  it("mirrors the terminal's dy before rotating, flipping it top-to-bottom", () => {
    // opamp inMinus is at local (-35, 15); mirrored and unrotated it should land above center instead.
    const part: PartInstance = { id: "U1", type: "opamp", x: 100, y: 100, rotation: 0, mirror: true, params: {} };
    const pos = terminalPosition(part, "inMinus");
    expect(pos.x).toBeCloseTo(65, 9);
    expect(pos.y).toBeCloseTo(85, 9);
  });

  it("composes mirror and rotation: mirror first, then rotate the flipped offset", () => {
    const part: PartInstance = { id: "U1", type: "opamp", x: 0, y: 0, rotation: 90, mirror: true, params: {} };
    const pos = terminalPosition(part, "inMinus"); // local (-35, 15) -> mirrored (-35, -15) -> rotated 90
    expect(pos.x).toBeCloseTo(15, 9);
    expect(pos.y).toBeCloseTo(-35, 9);
  });
});

describe("zoomAroundPoint", () => {
  it("keeps the world point under the cursor fixed on screen when zooming in", () => {
    const view = { zoom: 1, panX: 0, panY: 0 };
    const cursor = { x: 200, y: 150 };
    const worldBefore = { x: (cursor.x - view.panX) / view.zoom, y: (cursor.y - view.panY) / view.zoom };

    const next = zoomAroundPoint(view, cursor, 1.1, 0.3, 3);

    expect(next.zoom).toBeCloseTo(1.1, 9);
    const worldAfter = { x: (cursor.x - next.panX) / next.zoom, y: (cursor.y - next.panY) / next.zoom };
    expect(worldAfter.x).toBeCloseTo(worldBefore.x, 9);
    expect(worldAfter.y).toBeCloseTo(worldBefore.y, 9);
  });

  it("clamps zoom to the given min/max range", () => {
    const view = { zoom: 1, panX: 0, panY: 0 };
    expect(zoomAroundPoint(view, { x: 0, y: 0 }, 0.01, 0.3, 3).zoom).toBe(0.3);
    expect(zoomAroundPoint(view, { x: 0, y: 0 }, 100, 0.3, 3).zoom).toBe(3);
  });

  it("preserves the cursor's fixed world point across an existing pan/zoom", () => {
    const view = { zoom: 1.5, panX: 40, panY: -20 };
    const cursor = { x: 300, y: 80 };
    const worldBefore = { x: (cursor.x - view.panX) / view.zoom, y: (cursor.y - view.panY) / view.zoom };

    const next = zoomAroundPoint(view, cursor, 0.9, 0.3, 3);
    const worldAfter = { x: (cursor.x - next.panX) / next.zoom, y: (cursor.y - next.panY) / next.zoom };

    expect(worldAfter.x).toBeCloseTo(worldBefore.x, 9);
    expect(worldAfter.y).toBeCloseTo(worldBefore.y, 9);
  });
});

describe("computeWirePaths", () => {
  it("adds a hop (Q curve) to the vertical wire where two unrelated wires truly cross", () => {
    // Horizontal wire from (0,50) to (100,50); vertical wire from (50,0) to (50,100) - they cross at (50,50).
    const [horizontalPath, verticalPath] = computeWirePaths([
      [{ x: 0, y: 50 }, { x: 100, y: 50 }],
      [{ x: 50, y: 0 }, { x: 50, y: 100 }],
    ]);

    expect(horizontalPath).not.toContain("Q"); // horizontal wire stays straight
    expect(verticalPath).toContain("Q"); // vertical wire gets the hop
  });

  it("does not add a hop where two wires only meet at a shared terminal (a real junction)", () => {
    // Wires meeting exactly at (50,50), an endpoint of both - not a mid-path crossing.
    const paths = computeWirePaths([
      [{ x: 0, y: 50 }, { x: 50, y: 50 }],
      [{ x: 50, y: 50 }, { x: 50, y: 100 }],
    ]);

    for (const p of paths) expect(p).not.toContain("Q");
  });

  it("adds no hops for wires that never cross", () => {
    const paths = computeWirePaths([
      [{ x: 0, y: 0 }, { x: 100, y: 0 }],
      [{ x: 0, y: 200 }, { x: 100, y: 200 }],
    ]);
    for (const p of paths) expect(p).not.toContain("Q");
  });

  it("matches orthogonalPath's straight-line output when there is only one wire (nothing to cross)", () => {
    const a = { x: 0, y: 0 };
    const b = { x: 100, y: 40 };
    const [path] = computeWirePaths([[a, b]]);
    expect(path).toBe(orthogonalPath(a, b));
  });
});

describe("orthogonalPath", () => {
  it("degenerates to a single straight segment (no redundant midpoint) when points already share an axis", () => {
    const path = orthogonalPath({ x: 0, y: 50 }, { x: 100, y: 50 });
    expect(path).toBe("M0,50 L100,50");
  });

  it("bends through a midpoint when the two points share neither axis", () => {
    const path = orthogonalPath({ x: 0, y: 0 }, { x: 100, y: 10 });
    // dx (100) > dy (10), so it should route horizontal-first through midX = 50.
    expect(path).toBe("M0,0 L50,0 L50,10 L100,10");
  });
});

describe("fitView", () => {
  const viewport = { width: 800, height: 400 };

  it("returns the identity view when there is no content to fit", () => {
    expect(fitView([], viewport)).toEqual({ zoom: 1, panX: 0, panY: 0 });
  });

  it("centers content that already fits without magnifying it past 1:1", () => {
    // A 100x100 box at the origin fits in 800x400 many times over - fitting it should center it,
    // not blow a two-part circuit up to fill the canvas.
    const view = fitView([{ minX: 0, minY: 0, maxX: 100, maxY: 100 }], viewport);
    expect(view.zoom).toBe(1);
    // content center (50,50) must land on the viewport center (400,200)
    expect(50 * view.zoom + view.panX).toBeCloseTo(400);
    expect(50 * view.zoom + view.panY).toBeCloseTo(200);
  });

  it("zooms out until oversized content fits inside the viewport, with padding", () => {
    // minZoom is lowered here so the assertion is about the fitting math itself; the separate
    // test below covers what happens when content is too big even for the minimum zoom.
    const bounds = [{ minX: 0, minY: 0, maxX: 4000, maxY: 400 }];
    const view = fitView(bounds, viewport, { minZoom: 0.05 });
    expect(view.zoom).toBeLessThan(1);
    const left = view.panX; // world x = 0 maps straight to the pan offset
    const right = 4000 * view.zoom + view.panX;
    expect(left).toBeGreaterThanOrEqual(0);
    expect(right).toBeLessThanOrEqual(viewport.width);
  });

  it("never zooms out past the minimum zoom, even for content far larger than the viewport", () => {
    const view = fitView([{ minX: 0, minY: 0, maxX: 1e6, maxY: 1e6 }], viewport, { minZoom: 0.3 });
    expect(view.zoom).toBe(0.3);
  });

  it("fits the union of several separate content boxes", () => {
    const view = fitView(
      [
        { minX: 0, minY: 0, maxX: 50, maxY: 50 },
        { minX: 1950, minY: 0, maxX: 2000, maxY: 50 },
      ],
      viewport,
    );
    const left = view.panX; // world x = 0 maps straight to the pan offset
    const right = 2000 * view.zoom + view.panX;
    expect(left).toBeGreaterThanOrEqual(0);
    expect(right).toBeLessThanOrEqual(viewport.width);
  });
});

describe("computeWirePaths lane spreading", () => {
  it("gives parallel wires different bend positions instead of stacking them", () => {
    // Four nets running the same way between two columns of parts - the case that produced a
    // clump of hops all at the same x (docs/ROADMAP.md §6 routing risk 3).
    const endpoints: [Point, Point][] = [0, 1, 2, 3].map((i) => [
      { x: 0, y: i * 40 },
      { x: 300, y: i * 40 + 20 },
    ]);
    const paths = computeWirePaths(endpoints);

    // Each 2-bend path turns at some x; those x values must not all be the same.
    const bendXs = paths.map((d) => Number(d.split("L")[1].split(",")[0]));
    expect(new Set(bendXs).size).toBeGreaterThan(1);
  });

  it("keeps every bend between the two endpoints it joins", () => {
    const endpoints: [Point, Point][] = [0, 1, 2, 3, 4, 5].map((i) => [
      { x: 100, y: i * 30 },
      { x: 220, y: i * 30 + 15 },
    ]);
    for (const d of computeWirePaths(endpoints)) {
      const bendX = Number(d.split("L")[1].split(",")[0]);
      // A bend outside the span would send the wire out and back, which reads as a routing bug.
      expect(bendX).toBeGreaterThanOrEqual(100);
      expect(bendX).toBeLessThanOrEqual(220);
    }
  });

  it("still routes a single wire straight through the midpoint", () => {
    const [path] = computeWirePaths([[{ x: 0, y: 0 }, { x: 100, y: 10 }]]);
    expect(path).toBe(orthogonalPath({ x: 0, y: 0 }, { x: 100, y: 10 }));
  });
});
