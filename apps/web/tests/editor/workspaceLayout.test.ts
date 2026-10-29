import { describe, expect, it } from "vitest";
import { clampLayout, DEFAULT_LAYOUT, LIMITS, RAIL_WIDTH } from "../../src/editor/shell/useWorkspaceLayout";

describe("clampLayout", () => {
  it("keeps each column inside its own range", () => {
    const wide = clampLayout({ ...DEFAULT_LAYOUT, libraryWidth: 9000, inspectorWidth: 10 }, 3000);
    expect(wide.libraryWidth).toBe(LIMITS.library.max);
    expect(wide.inspectorWidth).toBe(LIMITS.inspector.min);
  });

  it("leaves the schematic its minimum width on a narrow window by shrinking the wider column first", () => {
    const squeezed = clampLayout({ ...DEFAULT_LAYOUT, libraryWidth: 500, inspectorWidth: 300 }, 1100);
    expect(squeezed.libraryWidth).toBeLessThan(500);
    expect(squeezed.inspectorWidth).toBe(300);
    expect(squeezed.libraryWidth).toBeGreaterThanOrEqual(LIMITS.library.min);
  });

  it("does not charge a folded column its full width against the budget", () => {
    const folded = clampLayout({ ...DEFAULT_LAYOUT, libraryWidth: 500, inspectorWidth: 500, inspectorCollapsed: true }, 1100);
    // 500 + rail fits where 500 + 500 would not.
    expect(folded.libraryWidth).toBe(Math.min(500, 1100 - LIMITS.centerMin - 24 - 24 - RAIL_WIDTH));
  });

  it("is the identity when everything already fits", () => {
    expect(clampLayout(DEFAULT_LAYOUT, 1440)).toEqual(DEFAULT_LAYOUT);
  });
});
