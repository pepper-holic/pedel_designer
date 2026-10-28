import { describe, expect, it } from "vitest";
import { runMonteCarloAc, robustSpreadDb, type MonteCarloResult } from "../../src/core/analysis/montecarlo";
import { logFrequencySweep } from "../../src/core/solver/ac";
import { passiveToneTiltPreset } from "../../src/core/library/presets/passive-tone-tilt";

/** Deterministic sequence generator so tests are reproducible instead of relying on Math.random. */
function seededRng(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

describe("runMonteCarloAc", () => {
  it("collapses to a single deterministic curve at 0% tolerance", () => {
    const netlist = passiveToneTiltPreset.build(passiveToneTiltPreset.defaultParams);
    const frequenciesHz = logFrequencySweep(100, 10000, 5);
    const result = runMonteCarloAc(netlist, passiveToneTiltPreset.inputSourceId, passiveToneTiltPreset.outputNode, { tolerancePercent: 0, iterations: 10, frequenciesHz }, seededRng(1));

    for (let i = 0; i < frequenciesHz.length; i++) {
      expect(result.maxDb[i] - result.minDb[i]).toBeLessThan(1e-9);
      expect(result.meanDb[i]).toBeCloseTo(result.minDb[i], 9);
    }
  });

  it("produces a real spread between runs once tolerance is applied", () => {
    const netlist = passiveToneTiltPreset.build(passiveToneTiltPreset.defaultParams);
    const frequenciesHz = logFrequencySweep(100, 10000, 5);
    const result = runMonteCarloAc(
      netlist,
      passiveToneTiltPreset.inputSourceId,
      passiveToneTiltPreset.outputNode,
      { tolerancePercent: 20, iterations: 30, frequenciesHz },
      seededRng(42),
    );

    expect(result.runs).toHaveLength(30);
    const anySpread = frequenciesHz.some((_, i) => result.maxDb[i] - result.minDb[i] > 0.1);
    expect(anySpread).toBe(true);
    for (let i = 0; i < frequenciesHz.length; i++) {
      expect(result.minDb[i]).toBeLessThanOrEqual(result.meanDb[i]);
      expect(result.maxDb[i]).toBeGreaterThanOrEqual(result.meanDb[i]);
    }
  });

  it("wider tolerance produces a wider (or equal) spread than a narrower one", () => {
    const netlist = passiveToneTiltPreset.build(passiveToneTiltPreset.defaultParams);
    const frequenciesHz = logFrequencySweep(100, 10000, 5);

    const narrow = runMonteCarloAc(netlist, passiveToneTiltPreset.inputSourceId, passiveToneTiltPreset.outputNode, { tolerancePercent: 2, iterations: 30, frequenciesHz }, seededRng(7));
    const wide = runMonteCarloAc(netlist, passiveToneTiltPreset.inputSourceId, passiveToneTiltPreset.outputNode, { tolerancePercent: 30, iterations: 30, frequenciesHz }, seededRng(7));

    const narrowMaxSpread = Math.max(...frequenciesHz.map((_, i) => narrow.maxDb[i] - narrow.minDb[i]));
    const wideMaxSpread = Math.max(...frequenciesHz.map((_, i) => wide.maxDb[i] - wide.minDb[i]));
    expect(wideMaxSpread).toBeGreaterThan(narrowMaxSpread);
  });
});

describe("robustSpreadDb", () => {
  /** 20 runs at one frequency: 18 cluster near 0 dB, 2 are wild outliers (e.g. a non-ideal op-amp's
   * DC bias pushed into hard clipping by that particular draw of component values) - the real-world
   * situation that made the raw max-min "worst case" headline number explode into the hundreds of dB
   * even though the circuit mostly behaves consistently. */
  function resultWithOutliers(clustered: number[], outliers: number[]): MonteCarloResult {
    const runs = [...clustered, ...outliers].map((db) => [db]);
    return { frequenciesHz: [1000], runs, meanDb: [0], minDb: [Math.min(...outliers, ...clustered)], maxDb: [Math.max(...outliers, ...clustered)] };
  }

  it("is not dominated by a couple of clipped-run outliers the way raw max-min is", () => {
    const clustered = Array.from({ length: 18 }, (_, i) => -1 + i * 0.1); // tight band around 0 dB
    const result = resultWithOutliers(clustered, [-200, 40]); // two runs far outside the normal band
    const rawSpread = Math.max(...result.maxDb.map((v, i) => v - result.minDb[i]));
    expect(rawSpread).toBeGreaterThan(200); // the number the old code reported
    expect(robustSpreadDb(result)).toBeLessThan(5); // the trimmed stat ignores those two
  });

  it("still reflects a genuine spread most runs agree on, not just the outliers", () => {
    const clustered = Array.from({ length: 18 }, (_, i) => -10 + i * 1.2); // ~20 dB of real spread
    const result = resultWithOutliers(clustered, [-200, 40]);
    const spread = robustSpreadDb(result);
    expect(spread).toBeGreaterThan(10);
    expect(spread).toBeLessThan(200);
  });
});
