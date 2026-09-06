import { describe, expect, it } from "vitest";
import { netlistFromGraph } from "../../src/editor/netlistFromGraph";
import { runAcAnalysis, logFrequencySweep } from "../../src/core/solver/ac";
import type { PartInstance, Wire } from "../../src/editor/types";

/** Frequency of the AC sweep point with the highest magnitude - the resonant peak. */
function peakFrequency(points: { frequencyHz: number; magnitudeDb: number }[]): number {
  return points.reduce((best, p) => (p.magnitudeDb > best.magnitudeDb ? p : best)).frequencyHz;
}

/**
 * A magnetic pickup loaded by an amp input. The pickup's own inductance resonates with the total
 * capacitance hanging off its hot lead, which is what puts the presence peak in a guitar's tone -
 * see docs/plan-guitar-wiring.md §4.
 */
function pickupRig(cableCapacitanceF: number | null): { parts: PartInstance[]; wires: Wire[] } {
  const parts: PartInstance[] = [
    {
      id: "PU1",
      type: "pickup",
      x: 0,
      y: 0,
      rotation: 0,
      params: { inductance: 2.2, dcResistance: 5800, selfCapacitance: 100e-12 },
    },
    { id: "Rload", type: "resistor", x: 200, y: 0, rotation: 0, params: { resistance: 1e6 } },
    { id: "G1", type: "ground", x: 100, y: 100, rotation: 0, params: {} },
  ];
  const wires: Wire[] = [
    { id: "w1", a: { partId: "PU1", terminalId: "hot" }, b: { partId: "Rload", terminalId: "a" } },
    { id: "w2", a: { partId: "Rload", terminalId: "b" }, b: { partId: "G1", terminalId: "gnd" } },
    { id: "w3", a: { partId: "PU1", terminalId: "gnd" }, b: { partId: "G1", terminalId: "gnd" } },
  ];
  if (cableCapacitanceF !== null) {
    parts.push({ id: "Ccable", type: "capacitor", x: 200, y: 100, rotation: 0, params: { capacitance: cableCapacitanceF } });
    wires.push({ id: "w4", a: { partId: "Ccable", terminalId: "a" }, b: { partId: "Rload", terminalId: "a" } });
    wires.push({ id: "w5", a: { partId: "Ccable", terminalId: "b" }, b: { partId: "G1", terminalId: "gnd" } });
  }
  return { parts, wires };
}

describe("pickup part", () => {
  it("expands into its series R-L and parallel C, driven by its own signal source", () => {
    const { parts, wires } = pickupRig(null);
    const { netlist, inputSourceId, netNames } = netlistFromGraph(parts, wires);

    const mine = netlist.elements.filter((e) => e.id.startsWith("PU1"));
    expect(mine.map((e) => e.type).sort()).toEqual(["capacitor", "inductor", "resistor", "vsource"]);
    // The pickup's own source is the audio input - the role flag, not array order, decides this.
    expect(inputSourceId).toBe(mine.find((e) => e.type === "vsource")!.id);
    // Its two internal nodes are an implementation detail and must not show up as pickable
    // output nodes in the UI.
    expect(netNames.some((n) => n.startsWith("PU1"))).toBe(false);
  });

  it("resonates near 1/(2*pi*sqrt(L*C)) set by its own self-capacitance", () => {
    const { parts, wires } = pickupRig(null);
    const { netlist, inputSourceId } = netlistFromGraph(parts, wires);

    const points = runAcAnalysis(netlist, {
      inputSourceId: inputSourceId!,
      outputNode: netlistFromGraph(parts, wires).terminalNet.get("PU1:hot")!,
      frequenciesHz: logFrequencySweep(20, 20000, 60),
    });

    const predicted = 1 / (2 * Math.PI * Math.sqrt(2.2 * 100e-12)); // ~10.7 kHz
    const measured = peakFrequency(points);
    expect(measured).toBeGreaterThan(predicted * 0.8);
    expect(measured).toBeLessThan(predicted * 1.2);
  });

  it("drops the resonant peak when cable capacitance is added in parallel", () => {
    const bare = pickupRig(null);
    const cabled = pickupRig(500e-12); // ~3-5 m of typical instrument cable

    const sweep = (rig: { parts: PartInstance[]; wires: Wire[] }) => {
      const graph = netlistFromGraph(rig.parts, rig.wires);
      return runAcAnalysis(graph.netlist, {
        inputSourceId: graph.inputSourceId!,
        outputNode: graph.terminalNet.get("PU1:hot")!,
        frequenciesHz: logFrequencySweep(20, 20000, 60),
      });
    };

    expect(peakFrequency(sweep(cabled))).toBeLessThan(peakFrequency(sweep(bare)));
  });
});
