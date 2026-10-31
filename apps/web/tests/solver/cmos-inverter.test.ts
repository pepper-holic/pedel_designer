import { describe, expect, it } from "vitest";
import { buildTopology } from "../../src/core/solver/topology";
import { solveNewton } from "../../src/core/solver/newton";
import { voltageAt } from "../../src/core/solver/solution";
import { runAcAnalysis } from "../../src/core/solver/ac";
import { runTransient } from "../../src/core/solver/transient";
import type { Element, Netlist } from "../../src/core/solver/types";
import { INVERTER_GAIN, inverterElements, inverterPinout } from "../../src/core/library/kits/cmosInverter";
import { kitToPreset } from "../../src/core/library/kits/kitToPreset";
import type { KitCircuit } from "../../src/core/library/kits/types";

const supply: Element = { id: "Vcc", type: "vsource", nodes: ["vcc", "0"], voltage: 9 };
const input: Element = { id: "V1", type: "vsource", nodes: ["in", "0"], voltage: 0 };
const RF = 1_000_000;
const RI = 100_000;

/** Red Llama-style stage: in -> 1uF -> 100K -> inverter A (pins 3/2) with 1M feedback, output on "out". */
function stage(extra: Element[] = []): Netlist {
  const chip = inverterElements("U1", inverterPinout("CD4049UBE")!, { 1: "vcc", 8: "0", 3: "g", 2: "out" }, { top: 9, bottom: 0 });
  return {
    elements: [
      supply,
      input,
      { id: "Cin", type: "capacitor", nodes: ["in", "c"], capacitance: 1e-6 },
      { id: "Ri", type: "resistor", nodes: ["c", "g"], resistance: RI },
      { id: "Rf", type: "resistor", nodes: ["out", "g"], resistance: RF },
      ...chip,
      ...extra,
      { id: "RL", type: "resistor", nodes: ["out", "0"], resistance: 1_000_000 },
    ],
  };
}

const dc = (netlist: Netlist) => {
  const topology = buildTopology(netlist);
  const { solution, converged } = solveNewton(netlist, topology, new Map(), 0);
  return { converged, at: (node: string) => voltageAt(topology, solution, node) };
};

describe("CD4049 linear inverter approximation", () => {
  it("self-biases its output just under half the supply through the feedback resistor", () => {
    const { converged, at } = dc(stage());
    expect(converged).toBe(true);
    // Vout = A*Vdd/2 / (A+1) with in = out at DC through Rf.
    expect(at("out")).toBeCloseTo((INVERTER_GAIN * 4.5) / (INVERTER_GAIN + 1), 1);
    expect(at("g")).toBeCloseTo(at("out"), 2);
  });

  it("inverts with the closed-loop gain of an inverting amp of finite open-loop gain", () => {
    const [{ magnitudeDb, phaseDeg }] = runAcAnalysis(stage(), { inputSourceId: "V1", outputNode: "out", frequenciesHz: [1000] });
    const expected = (RF / RI) * (INVERTER_GAIN / (INVERTER_GAIN + 1 + RF / RI));
    expect(magnitudeDb).toBeCloseTo(20 * Math.log10(expected), 0);
    expect(Math.abs(Math.abs(phaseDeg) - 180)).toBeLessThan(5);
  });

  it("saturates smoothly between the supply rails on a large input", () => {
    // Without the coupling cap (the transient starts from rest, not from the bias point) the source itself carries the
    // bias: samples swing +-3V about the self-bias voltage.
    const bias = (INVERTER_GAIN * 4.5) / (INVERTER_GAIN + 1);
    const direct: Netlist = { elements: stage().elements.filter((e) => e.id !== "Cin").map((e) => (e.id === "Ri" ? { ...e, nodes: ["in", "g"] as [string, string] } : e)) };
    const inputSamples = new Float64Array(200).map((_, i) => bias + 3 * Math.sin((2 * Math.PI * i) / 100));
    const { traces } = runTransient(direct, { inputSourceId: "V1", inputSamples, sampleRate: 48_000, tapNodes: ["out"] });
    const out = traces.get("out")!;
    const max = Math.max(...out);
    const min = Math.min(...out);
    expect(max).toBeLessThanOrEqual(9.001);
    expect(max).toBeGreaterThan(8);
    expect(min).toBeGreaterThanOrEqual(-0.001);
    expect(min).toBeLessThan(1);
  });

  it("stamps only the inverters with both pins wired and knows the 4069 pinout", () => {
    const els = inverterElements("U1", inverterPinout("CD4069UBE")!, { 14: "vcc", 7: "0", 1: "a", 2: "b", 3: "c", 5: "0" }, { top: 9, bottom: 0 });
    expect(els.map((e) => e.id)).toEqual(["U1_rt1", "U1_rt2", "U1A"]);
    expect(() => inverterElements("U1", inverterPinout("CD4049")!, { 1: "vcc", 8: "0", 3: "a" }, { top: 9, bottom: 0 })).toThrow();
    expect(inverterPinout("TL072")).toBeUndefined();
  });

  it("converts an IC CD4049 kit line into inverter channels placed from the A channel", () => {
    const kit: KitCircuit = {
      id: "t-inv",
      goodsNo: "0",
      kitName: "inv",
      motif: "inv",
      type: "fuzz",
      description: "",
      supply: 9,
      parts: [
        { ref: "C1", kind: "C", value: "1uF", nodes: ["in", "n2"] },
        { ref: "R1", kind: "R", value: "100K", nodes: ["n2", "n1"] },
        { ref: "R2", kind: "R", value: "1M", nodes: ["n1", "out"] },
        { ref: "U1", kind: "IC", part: "CD4049UBE", nodes: { "1": "vcc", "8": "0", "3": "n1", "2": "out" } },
      ],
      layout: { U1A: { x: 300, y: 400 } },
    };
    const preset = kitToPreset(kit);
    const netlist = preset.build({});
    expect(netlist.elements.some((e) => e.id === "U1A" && e.type === "opamp")).toBe(true);
    expect(preset.layout?.U1_rt1).toEqual({ x: 210, y: 470, rotation: 90 });
    const { converged, at } = dc(netlist);
    expect(converged).toBe(true);
    expect(at("out")).toBeGreaterThan(4);
    expect(at("out")).toBeLessThan(4.6);
  });
});
