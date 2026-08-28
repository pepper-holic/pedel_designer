import { describe, expect, it } from "vitest";
import { runMonteCarloAc } from "../../src/core/analysis/montecarlo";
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
