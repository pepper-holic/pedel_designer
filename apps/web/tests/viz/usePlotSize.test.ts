import { describe, expect, it } from "vitest";
import { niceStep, plotArea } from "../../src/viz/usePlotSize";

describe("plot layout helpers", () => {
  it("keeps axis labels outside the data area", () => {
    const area = plotArea(600, 200);
    expect(area.left).toBeGreaterThanOrEqual(40); // room for "-100dB"
    expect(200 - area.bottom).toBeGreaterThanOrEqual(16); // room for the frequency labels
    expect(area.right).toBeLessThan(600);
  });

  it("thins the gridlines on a short plot so labels never overlap", () => {
    expect(niceStep(100, 400, 10)).toBe(10); // 40px per 10dB
    expect(niceStep(100, 120, 10)).toBe(20); // 12px per 10dB -> every 20dB
    expect(niceStep(120, 60, 10)).toBe(40);
    expect((60 / 120) * niceStep(120, 60, 10)).toBeGreaterThanOrEqual(18);
  });
});
