import { describe, expect, it } from "vitest";
import { linearizeJfet } from "../../src/core/components/jfet";
import { buildTopology } from "../../src/core/solver/topology";
import { solveNewton } from "../../src/core/solver/newton";
import { voltageAt } from "../../src/core/solver/solution";
import { runAcAnalysis, logFrequencySweep } from "../../src/core/solver/ac";
import { jfetBoostPreset } from "../../src/core/library/presets/jfet-boost";
import type { JfetElement } from "../../src/core/solver/types";

const el: JfetElement = { id: "Q1", type: "jfet", nodes: ["g", "d", "s"], idss: 2e-3, pinchOffVoltage: -2.5 };

describe("linearizeJfet", () => {
  it("returns Idss at Vgs=0, and keeps a slope there so Newton can move off it", () => {
    const { id0, gm } = linearizeJfet(el, 0);
    expect(id0).toBeCloseTo(2e-3, 6);
    // dId/dVgs of the square law at Vgs=0 is 2*Idss/|Vp|; a flat 0 here is what made a source
    // follower's Newton solve bounce between "fully on" and "cut off" without converging.
    expect(gm).toBeGreaterThan(0);
    expect(linearizeJfet(el, 0.2).id0).toBeGreaterThan(id0);
  });

  it("returns zero current at/below pinch-off (fully off)", () => {
    expect(linearizeJfet(el, -2.5).id0).toBe(0);
    expect(linearizeJfet(el, -5).id0).toBe(0);
  });

  it("follows the square law between pinch-off and 0V", () => {
    // Vgs = -1.25 = Vp/2 -> (1 - Vgs/Vp) = 0.5 -> Id = Idss*0.25
    const { id0 } = linearizeJfet(el, -1.25);
    expect(id0).toBeCloseTo(2e-3 * 0.25, 6);
  });

  it("has positive transconductance that grows as Vgs approaches 0", () => {
    const nearPinchOff = linearizeJfet(el, -2.3);
    const nearZero = linearizeJfet(el, -0.2);
    expect(nearPinchOff.gm).toBeGreaterThan(0);
    expect(nearZero.gm).toBeGreaterThan(nearPinchOff.gm);
  });
});

describe("JFET boost preset", () => {
  it("self-biases to a sane operating point (not cut off, not saturated to the rail)", () => {
    const netlist = jfetBoostPreset.build(jfetBoostPreset.defaultParams);
    const topology = buildTopology(netlist);
    const { solution: dcSolution } = solveNewton(netlist, topology, new Map(), 0); // dt=0: true DC operating point (caps open)

    const vgate = voltageAt(topology, dcSolution, "gate");
    const vsource = voltageAt(topology, dcSolution, "source");
    const vdrain = voltageAt(topology, dcSolution, "drain");

    expect(vgate).toBeCloseTo(0, 1); // gate bias resistor to ground, negligible DC gate current
    expect(vsource).toBeGreaterThan(0.1); // self-bias raises the source above ground
    expect(vdrain).toBeGreaterThan(1); // not fully pulled down (not in triode/saturation collapse)
    expect(vdrain).toBeLessThan(9); // some current is flowing (not cut off at Vdd)
  });

  it("provides voltage gain at mid-band (bypassed source resistor boosts gm*Rd)", () => {
    const netlist = jfetBoostPreset.build(jfetBoostPreset.defaultParams);
    const points = runAcAnalysis(netlist, {
      inputSourceId: jfetBoostPreset.inputSourceId,
      outputNode: "outAC",
      frequenciesHz: logFrequencySweep(500, 2000, 4),
    });
    const midBandDb = points[Math.floor(points.length / 2)].magnitudeDb;
    expect(midBandDb).toBeGreaterThan(0); // net amplification, not just a buffer/attenuator
  });
});
