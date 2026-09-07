import { describe, expect, it } from "vitest";
import { runTransient } from "../../src/core/solver/transient";
import { runAcAnalysis, logFrequencySweep } from "../../src/core/solver/ac";
import { generateSineWave } from "../../src/audio/testTone";
import type { Netlist } from "../../src/core/solver/types";

const SAMPLE_RATE = 48000;

/**
 * A transformer: source and series resistor into the primary, load resistor across the secondary.
 * With an ideal coupling the secondary voltage should follow the turns ratio sqrt(L2/L1).
 */
function transformerRig(l1: number, l2: number, coupling: number): Netlist {
  return {
    elements: [
      { id: "V1", type: "vsource", nodes: ["in", "0"], voltage: 0 },
      { id: "Rs", type: "resistor", nodes: ["in", "pri"], resistance: 10 },
      { id: "T1", type: "coupledInductors", nodes: ["pri", "0", "sec", "0"], inductanceA: l1, inductanceB: l2, coupling },
      { id: "Rload", type: "resistor", nodes: ["sec", "0"], resistance: 100_000 },
    ],
  };
}

const peakGain = (netlist: Netlist) => {
  const points = runAcAnalysis(netlist, {
    inputSourceId: "V1",
    outputNode: "sec",
    frequenciesHz: logFrequencySweep(20, 20000, 30),
  });
  return points.reduce((m, p) => Math.max(m, p.magnitudeDb), -Infinity);
};

describe("coupled inductors", () => {
  it("passes signal to the secondary at roughly the turns ratio", () => {
    // L2 = 4*L1 means a 2:1 turns ratio, so about +6dB where the coupling is effective.
    const gain = peakGain(transformerRig(1, 4, 0.99));
    expect(gain).toBeGreaterThan(4);
    expect(gain).toBeLessThan(8);
  });

  it("passes almost nothing when the windings are uncoupled", () => {
    expect(peakGain(transformerRig(1, 4, 0))).toBeLessThan(-40);
  });

  it("couples more tightly as k rises", () => {
    expect(peakGain(transformerRig(1, 1, 0.9))).toBeGreaterThan(peakGain(transformerRig(1, 1, 0.3)));
  });

  it("adds mutual inductance when two coils are wired in series aiding", () => {
    // Series-aiding total inductance is L1 + L2 + 2M, so the same circuit resonates lower than
    // the uncoupled L1 + L2 would - this is the humbucker series case
    // (docs/plan-guitar-wiring.md §4-2).
    const seriesRig = (coupling: number): Netlist => ({
      elements: [
        { id: "V1", type: "vsource", nodes: ["in", "0"], voltage: 0 },
        { id: "Rs", type: "resistor", nodes: ["in", "a"], resistance: 1000 },
        { id: "T1", type: "coupledInductors", nodes: ["a", "mid", "mid", "out"], inductanceA: 2.2, inductanceB: 2.2, coupling },
        { id: "C1", type: "capacitor", nodes: ["out", "0"], capacitance: 150e-12 },
        { id: "Rload", type: "resistor", nodes: ["out", "0"], resistance: 1_000_000 },
      ],
    });
    const peakHz = (netlist: Netlist) => {
      const points = runAcAnalysis(netlist, { inputSourceId: "V1", outputNode: "out", frequenciesHz: logFrequencySweep(200, 20000, 60) });
      return points.reduce((best, p) => (p.magnitudeDb > best.magnitudeDb ? p : best)).frequencyHz;
    };
    expect(peakHz(seriesRig(0.5))).toBeLessThan(peakHz(seriesRig(0)));
  });

  it("stays finite through a transient run", () => {
    const { traces } = runTransient(transformerRig(1, 4, 0.9), {
      inputSourceId: "V1",
      inputSamples: generateSineWave(1000, 0.5, SAMPLE_RATE, 0.02),
      sampleRate: SAMPLE_RATE,
      tapNodes: ["sec"],
    });
    expect(traces.get("sec")!.every((v) => Number.isFinite(v))).toBe(true);
  });
});
