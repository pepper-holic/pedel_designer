import { describe, expect, it } from "vitest";
import { buildTopology } from "../../src/core/solver/topology";
import { solveNewton } from "../../src/core/solver/newton";
import { voltageAt } from "../../src/core/solver/solution";
import { runAcAnalysis } from "../../src/core/solver/ac";
import type { Element, Netlist } from "../../src/core/solver/types";
import { lm386Elements } from "../../src/core/library/kits/lm386";

const supply: Element = { id: "Vcc", type: "vsource", nodes: ["vcc", "0"], voltage: 9 };
const input: Element = { id: "V1", type: "vsource", nodes: ["in", "0"], voltage: 0 };

function amp(extra: Element[] = [], pins: Record<string, string> = {}): Netlist {
  const chip = lm386Elements("U1", { 2: "0", 3: "in", 4: "0", 5: "out", 6: "vcc", ...pins }, { top: 9, bottom: 0 });
  return { elements: [supply, input, ...chip, ...extra, { id: "RL", type: "resistor", nodes: ["out", "0"], resistance: 10_000 }] };
}

const gainDb = (netlist: Netlist): number => runAcAnalysis(netlist, { inputSourceId: "V1", outputNode: "out", frequenciesHz: [1000] })[0].magnitudeDb;

describe("LM386 approximation", () => {
  it("biases the output at half the supply with the inputs at ground", () => {
    const netlist = amp();
    const topology = buildTopology(netlist);
    const { solution, converged } = solveNewton(netlist, topology, new Map(), 0);
    expect(converged).toBe(true);
    expect(voltageAt(topology, solution, "out")).toBeCloseTo(4.5, 1);
  });

  it("has a voltage gain of about 20 with pins 1 and 8 open", () => {
    const db = gainDb(amp());
    expect(db).toBeGreaterThan(25.5);
    expect(db).toBeLessThan(27);
  });

  it("has a gain of about 200 with a 10uF cap across pins 1 and 8", () => {
    const cap: Element = { id: "C18", type: "capacitor", nodes: ["g1", "g8"], capacitance: 10e-6 };
    expect(gainDb(amp([cap], { 1: "g1", 8: "g8" }))).toBeCloseTo(46, 0);
  });

  it("keeps the half-supply bias with a gain cap fitted, since the cap blocks DC", () => {
    const cap: Element = { id: "C18", type: "capacitor", nodes: ["g1", "g8"], capacitance: 10e-6 };
    const netlist = amp([cap], { 1: "g1", 8: "g8" });
    const topology = buildTopology(netlist);
    const { solution } = solveNewton(netlist, topology, new Map(), 0);
    expect(voltageAt(topology, solution, "out")).toBeCloseTo(4.5, 1);
  });

  it("keeps the half-supply bias with pins 1 and 8 tied and grounded through 47R + 47uF", () => {
    const parts: Element[] = [
      { id: "R18", type: "resistor", nodes: ["g18", "gr"], resistance: 47 },
      { id: "C18", type: "capacitor", nodes: ["gr", "0"], capacitance: 47e-6 },
    ];
    const netlist = amp(parts, { 1: "g18", 8: "g18" });
    const topology = buildTopology(netlist);
    const { solution, converged } = solveNewton(netlist, topology, new Map(), 0);
    expect(converged).toBe(true);
    expect(voltageAt(topology, solution, "out")).toBeCloseTo(4.5, 1);
  });

  it("inverts a signal on pin 2 with pin 3 grounded", () => {
    const netlist = { elements: [supply, input, ...lm386Elements("U1", { 2: "in", 3: "0", 4: "0", 5: "out", 6: "vcc" }, { top: 9, bottom: 0 }), { id: "RL", type: "resistor" as const, nodes: ["out", "0"] as [string, string], resistance: 10_000 }] };
    const [p] = runAcAnalysis(netlist, { inputSourceId: "V1", outputNode: "out", frequenciesHz: [1000] });
    expect(p.magnitudeDb).toBeCloseTo(26, 0);
    expect(Math.abs(Math.abs(p.phaseDeg) - 180)).toBeLessThan(5);
  });

  it("clips the output short of the supply rails", () => {
    const chip = lm386Elements("U1", { 2: "0", 3: "in", 4: "0", 5: "out", 6: "vcc" }, { top: 9, bottom: 0 }).find((e) => e.id === "U1");
    expect(chip?.type).toBe("opamp");
    if (chip?.type !== "opamp") return;
    expect(chip.railPositive).toBeLessThan(9);
    expect(chip.railNegative).toBeGreaterThan(0);
  });
});
