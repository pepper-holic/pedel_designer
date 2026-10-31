import { describe, expect, it } from "vitest";
import { buildTopology } from "../../src/core/solver/topology";
import { solveNewton } from "../../src/core/solver/newton";
import { voltageAt } from "../../src/core/solver/solution";
import { runAcAnalysis } from "../../src/core/solver/ac";
import type { CapacitorElement, Netlist } from "../../src/core/solver/types";
import { kitToPreset } from "../../src/core/library/kits/kitToPreset";
import type { KitCircuit } from "../../src/core/library/kits/types";

const LEAK = 1e9;

function capIsland(leakage?: number): Netlist {
  const leak = leakage ? { leakage } : {};
  return {
    elements: [
      { id: "V1", type: "vsource", nodes: ["a", "0"], voltage: 9 },
      { id: "C1", type: "capacitor", nodes: ["a", "x"], capacitance: 22e-6, ...leak },
      { id: "C2", type: "capacitor", nodes: ["x", "0"], capacitance: 100e-9, ...leak },
    ],
  };
}

describe("capacitor leakage", () => {
  it("gives a node held only between capacitors a DC level from the leakage divider", () => {
    const netlist = capIsland(LEAK);
    const topology = buildTopology(netlist);
    const { solution, converged } = solveNewton(netlist, topology, new Map(), 0);
    expect(converged).toBe(true);
    expect(voltageAt(topology, solution, "x")).toBeCloseTo(4.5, 6);
  });

  it("leaves the audio-band response of the capacitors unchanged", () => {
    const withLeak = runAcAnalysis(capIsland(LEAK), { inputSourceId: "V1", outputNode: "x", frequenciesHz: [1000] })[0].magnitudeDb;
    const ratio = 20 * Math.log10(22e-6 / (22e-6 + 100e-9));
    expect(withLeak).toBeCloseTo(ratio, 4);
  });
});

describe("kitToPreset DC islands", () => {
  const kit: KitCircuit = {
    id: "test-island",
    goodsNo: "0",
    kitName: "island",
    motif: "test",
    type: "fuzz",
    description: "",
    supply: 9,
    parts: [
      { ref: "R1", kind: "R", value: "100K", nodes: ["in", "0"] },
      { ref: "C1", kind: "C", value: "22uF", nodes: ["in", "n1"] },
      { ref: "TONE", kind: "POT", value: "B50K", nodes: ["n1", "n1", "n2"] },
      { ref: "C2", kind: "C", value: "10n", nodes: ["n2", "0"] },
      { ref: "C3", kind: "C", value: "100n", nodes: ["n2", "out"] },
      { ref: "R2", kind: "R", value: "100K", nodes: ["out", "0"] },
    ],
  };

  it("puts leakage on the capacitors around a node group with no DC path, and only those", () => {
    const caps = kitToPreset(kit)
      .build({})
      .elements.filter((e): e is CapacitorElement => e.type === "capacitor");
    const leak = Object.fromEntries(caps.map((c) => [c.id, c.leakage]));
    expect(leak).toEqual({ C1: LEAK, C2: LEAK, C3: LEAK });
  });

  it("adds no leakage when every node has a DC path", () => {
    const grounded: KitCircuit = { ...kit, parts: [...kit.parts, { ref: "R3", kind: "R", value: "1M", nodes: ["n1", "0"] }] };
    const caps = kitToPreset(grounded)
      .build({})
      .elements.filter((e): e is CapacitorElement => e.type === "capacitor");
    expect(caps.every((c) => c.leakage === undefined)).toBe(true);
  });
});
