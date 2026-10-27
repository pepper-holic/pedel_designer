import { describe, expect, it } from "vitest";
import { placeLabels, rectsOverlap, type LabelRequest, type Rect } from "../../src/editor/layout/labels";

describe("rectsOverlap", () => {
  it("true for overlapping boxes, false for touching or separate ones", () => {
    expect(rectsOverlap({ x1: 0, y1: 0, x2: 10, y2: 10 }, { x1: 5, y1: 5, x2: 15, y2: 15 })).toBe(true);
    expect(rectsOverlap({ x1: 0, y1: 0, x2: 10, y2: 10 }, { x1: 10, y1: 0, x2: 20, y2: 10 })).toBe(false); // touching edge, not overlapping
    expect(rectsOverlap({ x1: 0, y1: 0, x2: 10, y2: 10 }, { x1: 20, y1: 20, x2: 30, y2: 30 })).toBe(false);
  });
});

describe("placeLabels", () => {
  it("uses the first direction at the closest tier when nothing is in the way", () => {
    const req: LabelRequest = { id: "a", anchor: { x: 100, y: 100 }, width: 40, height: 10, directions: ["up", "down", "left", "right"] };
    const result = placeLabels([req], []);
    const r = result.get("a")!;
    expect(r.x2 - r.x1).toBe(40);
    expect(r.y2 - r.y1).toBe(10);
    expect(r.y2).toBeLessThan(100); // "up" - the box sits above the anchor
  });

  it("moves to the next tier in the same direction when the closest one is blocked", () => {
    const req: LabelRequest = { id: "a", anchor: { x: 100, y: 100 }, width: 40, height: 10, directions: ["up"] };
    const blockedAtTier0 = placeLabels([req], []).get("a")!;
    const result = placeLabels([req], [blockedAtTier0]);
    const r = result.get("a")!;
    expect(rectsOverlap(r, blockedAtTier0)).toBe(false);
    expect(r.y2).toBeLessThan(blockedAtTier0.y1); // further up, not overlapping
  });

  it("falls through to the next direction when every tier of the first is blocked", () => {
    const req: LabelRequest = { id: "a", anchor: { x: 100, y: 100 }, width: 40, height: 10, directions: ["up", "down"] };
    // A tall obstacle covering every "up" tier, but nothing below.
    const obstacle: Rect = { x1: 50, y1: 0, x2: 150, y2: 100 };
    const r = placeLabels([req], [obstacle]).get("a")!;
    expect(r.y1).toBeGreaterThan(100); // ended up below the anchor instead
  });

  it("keeps two labels for the same anchor from landing on top of each other", () => {
    const anchor = { x: 100, y: 100 };
    const idLabel: LabelRequest = { id: "id", anchor, width: 38, height: 11, directions: ["up", "down", "left", "right"] };
    const valueLabel: LabelRequest = { id: "value", anchor, width: 48, height: 11, directions: ["up", "down", "left", "right"] };
    const result = placeLabels([idLabel, valueLabel], []);
    expect(rectsOverlap(result.get("id")!, result.get("value")!)).toBe(false);
  });

  it("still returns a box (doesn't drop the label) when every candidate collides", () => {
    const req: LabelRequest = { id: "a", anchor: { x: 0, y: 0 }, width: 40, height: 10, directions: ["up", "down", "left", "right"] };
    // A huge obstacle covering every candidate position at every tier.
    const everywhere: Rect = { x1: -1000, y1: -1000, x2: 1000, y2: 1000 };
    const result = placeLabels([req], [everywhere]);
    expect(result.has("a")).toBe(true);
    const r = result.get("a")!;
    expect(r.x2 - r.x1).toBe(40);
  });

  it("is deterministic: same inputs, same output", () => {
    const requests: LabelRequest[] = [
      { id: "a", anchor: { x: 0, y: 0 }, width: 30, height: 10, directions: ["up", "down"] },
      { id: "b", anchor: { x: 0, y: 0 }, width: 30, height: 10, directions: ["up", "down"] },
    ];
    const r1 = placeLabels(requests, []);
    const r2 = placeLabels(requests, []);
    expect(r1.get("a")).toEqual(r2.get("a"));
    expect(r1.get("b")).toEqual(r2.get("b"));
  });
});
