import { describe, expect, it } from "vitest";
import { netlistFromGraph } from "../../src/editor/netlistFromGraph";
import { runTransient } from "../../src/core/solver/transient";
import type { PartInstance, Wire } from "../../src/editor/types";

describe("netlistFromGraph", () => {
  it("builds a working RC low-pass netlist from parts wired on a canvas", () => {
    const parts: PartInstance[] = [
      { id: "V1", type: "vsource", x: 0, y: 0, rotation: 0, params: { voltage: 0 } },
      { id: "R1", type: "resistor", x: 100, y: 0, rotation: 0, params: { resistance: 1000 } },
      { id: "C1", type: "capacitor", x: 200, y: 0, rotation: 0, params: { capacitance: 1e-6 } },
      { id: "G1", type: "ground", x: 100, y: 100, rotation: 0, params: {} },
    ];
    const wires: Wire[] = [
      { id: "w1", a: { partId: "V1", terminalId: "positive" }, b: { partId: "R1", terminalId: "a" } },
      { id: "w2", a: { partId: "R1", terminalId: "b" }, b: { partId: "C1", terminalId: "a" } },
      { id: "w3", a: { partId: "C1", terminalId: "b" }, b: { partId: "G1", terminalId: "gnd" } },
      { id: "w4", a: { partId: "V1", terminalId: "negative" }, b: { partId: "G1", terminalId: "gnd" } },
    ];

    const { netlist, inputSourceId, netNames } = netlistFromGraph(parts, wires);

    expect(inputSourceId).toBe("V1");
    expect(netNames).toContain("0");
    expect(netlist.elements).toHaveLength(3); // V1, R1, C1 (ground contributes no element)

    const capNode = netlist.elements.find((e) => e.id === "C1")!.nodes[0];

    const R = 1000;
    const C = 1e-6;
    const sampleRate = 48000;
    const numSamples = Math.round((5 * R * C) / (1 / sampleRate));
    const inputSamples = new Float64Array(numSamples).fill(1);

    const { traces } = runTransient(netlist, { inputSourceId: inputSourceId!, inputSamples, sampleRate, tapNodes: [capNode] });
    const out = traces.get(capNode)!;

    // Should charge up toward the 1V step like a standard RC low-pass.
    expect(out[out.length - 1]).toBeGreaterThan(0.9);
    expect(out[0]).toBeLessThan(0.1);
  });
});
