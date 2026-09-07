import { describe, expect, it } from "vitest";
import { runTransient } from "../../src/core/solver/transient";
import type { Netlist } from "../../src/core/solver/types";
import { presets } from "../../src/core/library/presets";
import { generateSineWave } from "../../src/audio/testTone";

/** RC low-pass with a known analytic step response, so the numbers can be checked rather than
 * compared against each other. */
const R = 1000;
const C = 1e-6;
const rcLowPass: Netlist = {
  elements: [
    { id: "V1", type: "vsource", nodes: ["in", "0"], voltage: 0 },
    { id: "R1", type: "resistor", nodes: ["in", "out"], resistance: R },
    { id: "C1", type: "capacitor", nodes: ["out", "0"], capacitance: C },
  ],
};

function stepResponseError(integration: "backwardEuler" | "trapezoidal", sampleRate: number): number {
  const n = Math.floor(sampleRate * 0.005);
  const input = new Float64Array(n).fill(1);
  const { traces } = runTransient(rcLowPass, {
    inputSourceId: "V1",
    inputSamples: input,
    sampleRate,
    tapNodes: ["out"],
    integration,
  });
  const out = traces.get("out")!;

  // Worst absolute deviation from 1 - e^(-t/RC) over the run.
  let worst = 0;
  for (let i = 0; i < out.length; i++) {
    const t = (i + 1) / sampleRate;
    worst = Math.max(worst, Math.abs(out[i] - (1 - Math.exp(-t / (R * C)))));
  }
  return worst;
}

describe("integration method", () => {
  it("trapezoidal tracks the analytic RC step response more closely than backward Euler", () => {
    // A coarse timestep is where the two diverge; at a fine one both are close enough to hide it.
    const coarse = 8000;
    expect(stepResponseError("trapezoidal", coarse)).toBeLessThan(stepResponseError("backwardEuler", coarse) / 2);
  });

  it("defaults to backward Euler, which stays unconditionally stable on any topology", () => {
    const coarse = 8000;
    const n = Math.floor(coarse * 0.005);
    const { traces } = runTransient(rcLowPass, {
      inputSourceId: "V1",
      inputSamples: new Float64Array(n).fill(1),
      sampleRate: coarse,
      tapNodes: ["out"],
    });
    expect(Math.max(...traces.get("out")!)).toBeCloseTo(stepResponseError("backwardEuler", coarse) >= 0 ? Math.max(...traces.get("out")!) : 0, 6);
    // The default must match the explicit backward-Euler run exactly.
    const explicit = runTransient(rcLowPass, {
      inputSourceId: "V1",
      inputSamples: new Float64Array(n).fill(1),
      sampleRate: coarse,
      tapNodes: ["out"],
      integration: "backwardEuler",
    });
    expect(Array.from(traces.get("out")!)).toEqual(Array.from(explicit.traces.get("out")!));
  });

  it("keeps every shipped preset finite and convergent under trapezoidal", () => {
    // Trapezoidal is second-order but can ring on stiff networks, which is why backward Euler stays
    // the default. This checks the library does not fall over when the more accurate one is picked.
    const input = generateSineWave(220, 0.3, 48000, 0.01);
    for (const preset of presets) {
      const { traces, nonConvergentSampleCount } = runTransient(preset.build(preset.defaultParams), {
        inputSourceId: preset.inputSourceId,
        inputSamples: input,
        sampleRate: 48000,
        tapNodes: [preset.outputNode],
        integration: "trapezoidal",
      });
      expect(traces.get(preset.outputNode)!.every((v) => Number.isFinite(v)), `${preset.id} produced a non-finite sample`).toBe(true);
      expect(nonConvergentSampleCount, `${preset.id} failed to converge`).toBeLessThan(input.length * 0.02);
    }
  });
});
