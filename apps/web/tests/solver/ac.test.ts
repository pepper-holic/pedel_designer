import { describe, expect, it } from "vitest";
import { runAcAnalysis } from "../../src/core/solver/ac";
import type { Netlist } from "../../src/core/solver/types";

describe("AC frequency response", () => {
  it("shows a flat 0dB response for a unity op-amp buffer at every frequency", () => {
    const netlist: Netlist = {
      elements: [
        { id: "V1", type: "vsource", nodes: ["in", "0"], voltage: 0 },
        { id: "U1", type: "opamp", nodes: ["in", "out", "out"], openLoopGain: 1e5 },
      ],
    };

    const points = runAcAnalysis(netlist, {
      inputSourceId: "V1",
      outputNode: "out",
      frequenciesHz: [20, 1000, 20000],
    });

    for (const p of points) {
      expect(p.magnitudeDb).toBeCloseTo(0, 6);
      expect(p.phaseDeg).toBeCloseTo(0, 6);
    }
  });

  it("matches the analytic -3dB point and -45deg phase of an RC low-pass filter", () => {
    const R = 1000;
    const C = 1e-6;
    const cutoffHz = 1 / (2 * Math.PI * R * C);

    const netlist: Netlist = {
      elements: [
        { id: "V1", type: "vsource", nodes: ["in", "0"], voltage: 0 },
        { id: "R1", type: "resistor", nodes: ["in", "out"], resistance: R },
        { id: "C1", type: "capacitor", nodes: ["out", "0"], capacitance: C },
      ],
    };

    const points = runAcAnalysis(netlist, {
      inputSourceId: "V1",
      outputNode: "out",
      frequenciesHz: [cutoffHz, cutoffHz * 10],
    });

    expect(points[0].magnitudeDb).toBeCloseTo(-3.01, 1);
    expect(points[0].phaseDeg).toBeCloseTo(-45, 0);

    // A decade above cutoff, a first-order low-pass sits on the -20dB/decade
    // asymptote, i.e. ~20dB down from the (idealized, 0dB) corner - not from
    // the actual -3dB corner value, since the real curve is 3dB below the
    // asymptote right at the corner and converges onto it away from there.
    expect(points[1].magnitudeDb).toBeCloseTo(-20, 0);
  });
});
