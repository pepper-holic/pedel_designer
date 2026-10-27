import { describe, expect, it } from "vitest";
import { interpolate } from "../../src/viz/bandlimited";

describe("interpolate (Lanczos-3)", () => {
  it("passes through the samples exactly", () => {
    const data = [0, 0.5, -1, 0.25, 0.75];
    data.forEach((v, i) => expect(interpolate(data, i)).toBe(v));
  });

  it("reconstructs a well-sampled sine between its samples far better than straight lines", () => {
    // 8 samples per period: linear interpolation is off by ~7% at the midpoints.
    const n = 64;
    const data = Array.from({ length: n }, (_, i) => Math.sin((2 * Math.PI * i) / 8));
    let worstLanczos = 0;
    let worstLinear = 0;
    for (let i = 8; i < n - 8; i++) {
      const t = i + 0.5;
      const truth = Math.sin((2 * Math.PI * t) / 8);
      worstLanczos = Math.max(worstLanczos, Math.abs(interpolate(data, t) - truth));
      worstLinear = Math.max(worstLinear, Math.abs((data[i] + data[i + 1]) / 2 - truth));
    }
    expect(worstLanczos).toBeLessThan(0.02);
    expect(worstLinear).toBeGreaterThan(0.05);
  });
});
