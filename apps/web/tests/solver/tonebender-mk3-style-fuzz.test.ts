import { describe, expect, it } from "vitest";
import { runTransient } from "../../src/core/solver/transient";
import { buildTopology } from "../../src/core/solver/topology";
import { solveNewton } from "../../src/core/solver/newton";
import { voltageAt } from "../../src/core/solver/solution";
import { tonebenderMk3StyleFuzzPreset } from "../../src/core/library/presets/archive";

describe("Tonebender Mk III style fuzz", () => {
  it("biases every stage in its active region rather than saturated against a rail", () => {
    // Q1's own preamp stage: the check that would have caught the original hand-picked divider
    // (47k/470k) putting Q1 right at the edge of saturation with almost no headroom (Vec ~0.07V).
    const netlist = tonebenderMk3StyleFuzzPreset.build(tonebenderMk3StyleFuzzPreset.defaultParams);
    const topology = buildTopology(netlist);
    const { solution, converged } = solveNewton(netlist, topology, new Map(), 0);
    expect(converged).toBe(true);

    const vec = voltageAt(topology, solution, "q1emit") - voltageAt(topology, solution, "q1coll");
    expect(vec).toBeGreaterThan(1); // germanium saturation sits under ~0.1-0.2V

    // Q2/Q3 pair: same style of check the existing fuzz-germanium test uses for its own pair.
    const outc = voltageAt(topology, solution, "outc");
    expect(outc).toBeLessThan(-0.3);
    expect(outc).toBeGreaterThan(-8.7);
  });

  it("compresses a large input well below the small-signal gain", () => {
    // Same single-sample pattern the RAT-style archive test uses: probe the DC-coupled internal
    // node directly rather than the AC-coupled output, which has a ~1s time constant and would
    // still be mid-charge over any transient short enough to unit-test.
    const netlist = tonebenderMk3StyleFuzzPreset.build(tonebenderMk3StyleFuzzPreset.defaultParams);
    const dcOutc = (() => {
      const topo = buildTopology(netlist);
      const { solution } = solveNewton(netlist, topo, new Map(), 0);
      return voltageAt(topo, solution, "outc");
    })();
    const swingAt = (amplitude: number) => {
      const r = runTransient(tonebenderMk3StyleFuzzPreset.build(tonebenderMk3StyleFuzzPreset.defaultParams), {
        inputSourceId: tonebenderMk3StyleFuzzPreset.inputSourceId,
        inputSamples: new Float64Array([amplitude]),
        sampleRate: 48000,
        tapNodes: ["outc"],
      });
      return Math.abs(r.traces.get("outc")![0] - dcOutc);
    };

    const smallGain = swingAt(0.0002) / 0.0002;
    const largeGain = swingAt(0.05) / 0.05;
    // A cascaded 3-transistor fuzz is exactly this touchy - real units clip at a whisper of input,
    // which is the character this family is known for, not a modelling error.
    expect(largeGain).toBeLessThan(smallGain * 0.1);
  });

  it("changes the clipping level as the sustain control is turned, in either direction", () => {
    const swingAt = (sustainResistance: number) => {
      const params = { ...tonebenderMk3StyleFuzzPreset.defaultParams, sustainResistance };
      const r = runTransient(tonebenderMk3StyleFuzzPreset.build(params), {
        inputSourceId: tonebenderMk3StyleFuzzPreset.inputSourceId,
        inputSamples: new Float64Array([0.0002]),
        sampleRate: 48000,
        tapNodes: ["outc"],
      });
      return r.traces.get("outc")![0];
    };
    // Direction is a real, measured property of this loop (see the comment on Rsustain in the
    // preset) - not assumed, so the test pins the direction rather than just "some" difference.
    expect(Math.abs(swingAt(470_000))).toBeGreaterThan(Math.abs(swingAt(1_000)) * 2);
  });
});
