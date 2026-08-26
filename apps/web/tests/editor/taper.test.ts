import { describe, expect, it } from "vitest";
import { applyTaper } from "../../src/editor/taper";

describe("applyTaper", () => {
  it("B (linear) passes the position through unchanged", () => {
    expect(applyTaper("B", 0)).toBeCloseTo(0, 9);
    expect(applyTaper("B", 0.5)).toBeCloseTo(0.5, 9);
    expect(applyTaper("B", 1)).toBeCloseTo(1, 9);
  });

  it("A (audio/log) keeps most of the change in the back half of rotation", () => {
    expect(applyTaper("A", 1)).toBeCloseTo(1, 9);
    // At the midpoint, an audio taper has only moved ~10% of the way electrically.
    expect(applyTaper("A", 0.5)).toBeCloseTo(0.1, 9);
    expect(applyTaper("A", 0.5)).toBeLessThan(applyTaper("B", 0.5));
  });

  it("C (reverse audio) mirrors the A curve", () => {
    for (const x of [0, 0.25, 0.5, 0.75, 1]) {
      expect(applyTaper("C", x)).toBeCloseTo(1 - applyTaper("A", 1 - x), 9);
    }
  });

  it("clamps positions outside [0, 1]", () => {
    expect(applyTaper("B", -0.5)).toBe(0);
    expect(applyTaper("B", 1.5)).toBe(1);
  });
});
