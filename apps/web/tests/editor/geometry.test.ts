import { describe, expect, it } from "vitest";
import { snapToGrid, rotateClockwise, rotateOffset, terminalPosition, orthogonalPath, zoomAroundPoint, GRID_SIZE } from "../../src/editor/geometry";
import type { PartInstance } from "../../src/editor/types";

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

describe("orthogonalPath", () => {
  it("degenerates to a straight line when points already share an axis", () => {
    const path = orthogonalPath({ x: 0, y: 50 }, { x: 100, y: 50 });
    expect(path).toContain("M0,50");
    expect(path).toContain("50,50");
  });

  it("bends through a midpoint when the two points share neither axis", () => {
    const path = orthogonalPath({ x: 0, y: 0 }, { x: 100, y: 10 });
    // dx (100) > dy (10), so it should route horizontal-first through midX = 50.
    expect(path).toBe("M0,0 L50,0 L50,10 L100,10");
  });
});
