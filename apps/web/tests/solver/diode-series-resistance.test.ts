import { describe, expect, it } from "vitest";
import { runTransient } from "../../src/core/solver/transient";
import { runAcAnalysis } from "../../src/core/solver/ac";
import type { Netlist } from "../../src/core/solver/types";

function buildNetlist(seriesResistance?: number): Netlist {
  return {
    elements: [
      { id: "V1", type: "vsource", nodes: ["in", "0"], voltage: 0 },
      { id: "R1", type: "resistor", nodes: ["in", "out"], resistance: 1000 },
      {
        id: "D1",
        type: "diode",
        nodes: ["out", "0"],
        saturationCurrent: 4.352e-9,
        thermalVoltage: 0.02585,
        emissionCoefficient: 1.906,
        ...(seriesResistance !== undefined ? { seriesResistance } : {}),
      },
    ],
  };
}

describe("Diode series (bulk) resistance", () => {
  it("raises the diode's developed voltage at high forward current (Rs adds an I*Rs drop)", () => {
    const inputSamples = new Float64Array([5]);
    const ideal = runTransient(buildNetlist(undefined), { inputSourceId: "V1", inputSamples, sampleRate: 48000, tapNodes: ["out"] });
    const withRs = runTransient(buildNetlist(50), { inputSourceId: "V1", inputSamples, sampleRate: 48000, tapNodes: ["out"] });

    expect(withRs.traces.get("out")![0]).toBeGreaterThan(ideal.traces.get("out")![0]);
  });

  it("leaves the low-current small-signal region essentially unchanged", () => {
    const inputSamples = new Float64Array([0.02]);
    const ideal = runTransient(buildNetlist(undefined), { inputSourceId: "V1", inputSamples, sampleRate: 48000, tapNodes: ["out"] });
    const withRs = runTransient(buildNetlist(50), { inputSourceId: "V1", inputSamples, sampleRate: 48000, tapNodes: ["out"] });

    expect(withRs.traces.get("out")![0]).toBeCloseTo(ideal.traces.get("out")![0], 3);
  });

  it("does not break AC analysis (finite response) with seriesResistance set", () => {
    const points = runAcAnalysis(buildNetlist(50), { inputSourceId: "V1", outputNode: "out", frequenciesHz: [100, 1000, 10000] });
    for (const p of points) {
      expect(Number.isFinite(p.magnitudeDb)).toBe(true);
      expect(Number.isFinite(p.phaseDeg)).toBe(true);
    }
  });

  it("is a no-op when seriesResistance is 0 or unset - regression guard", () => {
    const inputSamples = new Float64Array([1, 3, 5]);
    const unset = runTransient(buildNetlist(undefined), { inputSourceId: "V1", inputSamples, sampleRate: 48000, tapNodes: ["out"] });
    const zero = runTransient(buildNetlist(0), { inputSourceId: "V1", inputSamples, sampleRate: 48000, tapNodes: ["out"] });
    for (let i = 0; i < inputSamples.length; i++) {
      expect(zero.traces.get("out")![i]).toBeCloseTo(unset.traces.get("out")![i], 9);
    }
  });
});
