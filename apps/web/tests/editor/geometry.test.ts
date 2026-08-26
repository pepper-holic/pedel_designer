import { describe, expect, it } from "vitest";
import { snapToGrid, rotateClockwise, rotateOffset, terminalPosition, orthogonalPath, GRID_SIZE } from "../../src/editor/geometry";
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
