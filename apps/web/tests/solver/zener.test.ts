import { describe, expect, it } from "vitest";
import { buildTopology } from "../../src/core/solver/topology";
import { solveNewton } from "../../src/core/solver/newton";
import { voltageAt } from "../../src/core/solver/solution";
import { runTransient } from "../../src/core/solver/transient";
import { runAcAnalysis } from "../../src/core/solver/ac";
import type { Element, Netlist } from "../../src/core/solver/types";
import { diodeModel, zenerModel } from "../../src/core/library/kits/partModels";
import { SILICON_DIODE_1N4148 } from "../../src/core/library/deviceModels";

const ZENER_3V3: Element = { id: "D1", type: "diode", nodes: ["0", "out"], ...SILICON_DIODE_1N4148, breakdownVoltage: 3.3 };

/** A source through 10K into the zener, cathode on "out", anode grounded. */
function clampAt(volts: number, diode: Element = ZENER_3V3): number {
  const netlist: Netlist = {
    elements: [
      { id: "V1", type: "vsource", nodes: ["in", "0"], voltage: volts },
      { id: "R1", type: "resistor", nodes: ["in", "out"], resistance: 10_000 },
      diode,
    ],
  };
  const topology = buildTopology(netlist);
  const { solution, converged } = solveNewton(netlist, topology, new Map(), 0);
  expect(converged).toBe(true);
  return voltageAt(topology, solution, "out");
}

describe("zener breakdown", () => {
  it("blocks reverse voltage below the zener voltage like any diode", () => {
    expect(clampAt(2)).toBeCloseTo(2, 2);
  });

  it("clamps reverse voltage at the zener voltage once the source exceeds it", () => {
    const v9 = clampAt(9);
    expect(v9).toBeGreaterThan(3.2);
    expect(v9).toBeLessThan(3.6);
    // 1mA at the nominal voltage, a soft knee above it: 9V through 10K is ~0.56mA, 20V ~1.6mA.
    expect(clampAt(20) - v9).toBeGreaterThan(0.02);
    expect(clampAt(20) - v9).toBeLessThan(0.2);
  });

  it("still conducts forward at the silicon drop", () => {
    const v = clampAt(-9);
    expect(v).toBeLessThan(-0.5);
    expect(v).toBeGreaterThan(-0.8);
  });

  it("leaves a diode without breakdownVoltage reverse-blocking", () => {
    const plain: Element = { id: "D1", type: "diode", nodes: ["0", "out"], ...SILICON_DIODE_1N4148 };
    expect(clampAt(9, plain)).toBeCloseTo(9, 2);
  });

  it("clips a signal symmetrically with two zeners back to back in series", () => {
    // Series-opposed pair across the output: one conducts forward (~0.6V) while the other breaks down (~3.3V).
    const netlist: Netlist = {
      elements: [
        { id: "V1", type: "vsource", nodes: ["in", "0"], voltage: 0 },
        { id: "R1", type: "resistor", nodes: ["in", "out"], resistance: 1_000 },
        { id: "D1", type: "diode", nodes: ["out", "mid"], ...SILICON_DIODE_1N4148, breakdownVoltage: 3.3 },
        { id: "D2", type: "diode", nodes: ["0", "mid"], ...SILICON_DIODE_1N4148, breakdownVoltage: 3.3 },
      ],
    };
    const inputSamples = new Float64Array([0.5, 2, 8, 12, -8, -12]);
    const { traces } = runTransient(netlist, { inputSourceId: "V1", inputSamples, sampleRate: 48_000, tapNodes: ["out"] });
    const out = traces.get("out")!;
    expect(out[0]).toBeCloseTo(0.5, 2);
    expect(out[1]).toBeCloseTo(2, 1);
    expect(out[3]).toBeGreaterThan(3.6);
    expect(out[3]).toBeLessThan(4.4);
    expect(out[3]).toBeCloseTo(-out[5], 1);
  });

  it("has the breakdown conductance in the AC small-signal model", () => {
    // Biased into breakdown through 10K, the zener's dynamic resistance (veff / 0.56mA ~ 90R) shunts the AC almost entirely.
    const netlist: Netlist = {
      elements: [
        { id: "Vb", type: "vsource", nodes: ["b", "0"], voltage: 9 },
        { id: "V1", type: "vsource", nodes: ["in", "b"], voltage: 0 },
        { id: "R1", type: "resistor", nodes: ["in", "out"], resistance: 10_000 },
        ZENER_3V3,
      ],
    };
    const [{ magnitudeDb }] = runAcAnalysis(netlist, { inputSourceId: "V1", outputNode: "out", frequenciesHz: [1000] });
    expect(magnitudeDb).toBeLessThan(-30);
  });
});

describe("zener part numbers", () => {
  it("reads the voltage from silk-style and catalogue part names", () => {
    expect(zenerModel("3V3")?.breakdownVoltage).toBe(3.3);
    expect(zenerModel("9V1")?.breakdownVoltage).toBe(9.1);
    expect(zenerModel("12V")?.breakdownVoltage).toBe(12);
    expect(zenerModel("ZENER3V3")?.breakdownVoltage).toBe(3.3);
    expect(zenerModel("ZENER3.3")?.breakdownVoltage).toBe(3.3);
    expect(zenerModel("BZX55C9V1")?.breakdownVoltage).toBe(9.1);
    expect(zenerModel("BZX79-C5V1")?.breakdownVoltage).toBe(5.1);
    expect(zenerModel("1N4739A")?.breakdownVoltage).toBe(9.1);
    expect(zenerModel("1N5226B")?.breakdownVoltage).toBe(3.3);
    expect(zenerModel("1N4742")?.breakdownVoltage).toBe(12);
  });

  it("keeps the bare ZENER and ordinary diodes as forward-only models", () => {
    expect(zenerModel("ZENER")).toBeUndefined();
    expect(diodeModel("ZENER")?.breakdownVoltage).toBeUndefined();
    expect(diodeModel("1N4148")?.breakdownVoltage).toBeUndefined();
    expect(diodeModel("1N400X")?.breakdownVoltage).toBeUndefined();
    expect(diodeModel("3V3")?.breakdownVoltage).toBe(3.3);
  });
});
