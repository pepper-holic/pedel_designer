import { describe, expect, it } from "vitest";
import { runAcAnalysis } from "../../src/core/solver/ac";
import { runTransient } from "../../src/core/solver/transient";
import type { Netlist } from "../../src/core/solver/types";

describe("Non-ideal op-amp: gain-bandwidth product", () => {
  it("shows a -3dB point at gbwpHz for a unity-gain buffer", () => {
    const gbwpHz = 1000;
    const netlist: Netlist = {
      elements: [
        { id: "V1", type: "vsource", nodes: ["in", "0"], voltage: 0 },
        { id: "U1", type: "opamp", nodes: ["in", "out", "out"], openLoopGain: 1e5, gbwpHz },
      ],
    };

    const points = runAcAnalysis(netlist, {
      inputSourceId: "V1",
      outputNode: "out",
      frequenciesHz: [gbwpHz, gbwpHz * 10],
    });

    expect(points[0].magnitudeDb).toBeCloseTo(-3.01, 1);
    expect(points[0].phaseDeg).toBeCloseTo(-45, 0);
    expect(points[1].magnitudeDb).toBeCloseTo(-20, 0);
  });

  it("leaves the ideal (no gbwpHz) buffer flat at every frequency - regression guard", () => {
    const netlist: Netlist = {
      elements: [
        { id: "V1", type: "vsource", nodes: ["in", "0"], voltage: 0 },
        { id: "U1", type: "opamp", nodes: ["in", "out", "out"], openLoopGain: 1e5 },
      ],
    };
    const points = runAcAnalysis(netlist, { inputSourceId: "V1", outputNode: "out", frequenciesHz: [20, 20000] });
    for (const p of points) expect(p.magnitudeDb).toBeCloseTo(0, 6);
  });
});

describe("Non-ideal op-amp: slew rate limiting", () => {
  it("caps the output's rate of change to slewRateVPerUs on a large step input", () => {
    const slewRateVPerUs = 0.5; // V/us -> 0.5e6 V/s
    const sampleRate = 1_000_000; // 1MHz - fine enough resolution to see a multi-sample slew ramp
    const dt = 1 / sampleRate;
    const maxStepPerSample = slewRateVPerUs * 1e6 * dt;

    const netlist: Netlist = {
      elements: [
        { id: "V1", type: "vsource", nodes: ["in", "0"], voltage: 0 },
        { id: "U1", type: "opamp", nodes: ["in", "out", "out"], openLoopGain: 1e5, slewRateVPerUs },
      ],
    };

    const n = 20;
    const inputSamples = new Float64Array(n).fill(5); // step from 0V to 5V, held

    const { traces } = runTransient(netlist, { inputSourceId: "V1", inputSamples, sampleRate, tapNodes: ["out"] });
    const trace = traces.get("out")!;

    for (let i = 1; i < n; i++) {
      expect(Math.abs(trace[i] - trace[i - 1])).toBeLessThanOrEqual(maxStepPerSample + 1e-9);
    }
    // Slew-limited step response should still be climbing (not instantly at 5V) partway through.
    expect(trace[5]).toBeLessThan(4);
    expect(trace[n - 1]).toBeCloseTo(5, 6);
  });

  it("does not limit the ideal (no slewRateVPerUs) buffer's step response", () => {
    const netlist: Netlist = {
      elements: [
        { id: "V1", type: "vsource", nodes: ["in", "0"], voltage: 0 },
        { id: "U1", type: "opamp", nodes: ["in", "out", "out"], openLoopGain: 1e5 },
      ],
    };
    const inputSamples = new Float64Array(4).fill(5);
    const { traces } = runTransient(netlist, { inputSourceId: "V1", inputSamples, sampleRate: 48000, tapNodes: ["out"] });
    expect(traces.get("out")![0]).toBeCloseTo(5, 9);
  });
});

describe("Non-ideal op-amp: rail-to-rail clipping", () => {
  it("keeps the output within the configured rails even when driven far beyond them", () => {
    const railPositive = 4;
    const railNegative = -4;
    const netlist: Netlist = {
      elements: [
        { id: "V1", type: "vsource", nodes: ["in", "0"], voltage: 0 },
        { id: "U1", type: "opamp", nodes: ["in", "out", "out"], openLoopGain: 1e5, railPositive, railNegative },
      ],
    };

    const inputSamples = new Float64Array(50).fill(50); // way beyond the rails
    const { traces } = runTransient(netlist, { inputSourceId: "V1", inputSamples, sampleRate: 48000, tapNodes: ["out"] });
    const trace = traces.get("out")!;

    for (const v of trace) {
      expect(v).toBeLessThan(railPositive + 0.5);
      expect(v).toBeGreaterThan(railNegative - 0.5);
    }
    // Should have saturated close to the positive rail by the end.
    expect(trace[trace.length - 1]).toBeGreaterThan(railPositive * 0.9);
  });

  it("stays linear (no clipping) for a small signal well within the rails", () => {
    const netlist: Netlist = {
      elements: [
        { id: "V1", type: "vsource", nodes: ["in", "0"], voltage: 0 },
        { id: "U1", type: "opamp", nodes: ["in", "out", "out"], openLoopGain: 1e5, railPositive: 4, railNegative: -4 },
      ],
    };
    const inputSamples = new Float64Array(10).fill(1);
    const { traces } = runTransient(netlist, { inputSourceId: "V1", inputSamples, sampleRate: 48000, tapNodes: ["out"] });
    expect(traces.get("out")![9]).toBeCloseTo(1, 2);
  });
});
