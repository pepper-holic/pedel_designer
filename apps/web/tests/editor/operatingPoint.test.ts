import { describe, expect, it } from "vitest";
import { computeOperatingPoint, formatVoltage } from "../../src/editor/operatingPoint";
import { loadPedalPreset } from "../../src/editor/templateLoading";
import { netlistFromGraph } from "../../src/editor/netlistFromGraph";
import { presets } from "../../src/core/library/presets";

describe("computeOperatingPoint", () => {
  it("biases the LPB-1 style boost's collector between the rails", () => {
    const preset = presets.find((p) => p.id === "lpb1-style-boost")!;
    const loaded = loadPedalPreset(preset);
    const graph = netlistFromGraph(loaded.snapshot.parts, loaded.snapshot.wires);
    const op = computeOperatingPoint(graph)!;
    expect(op.converged).toBe(true);
    const bjt = loaded.snapshot.parts.find((p) => p.type === "bjt")!;
    const collector = graph.terminalNet.get(`${bjt.id}:collector`)!;
    const vc = op.voltages.get(collector)!;
    // A working common-emitter stage sits well inside a 9V supply - neither saturated nor cut off.
    expect(vc).toBeGreaterThan(1);
    expect(vc).toBeLessThan(8.5);
  });

  it("holds the audio input at 0V regardless of the source's own voltage", () => {
    const preset = presets.find((p) => p.id === "buffer")!;
    const loaded = loadPedalPreset(preset);
    const parts = loaded.snapshot.parts.map((p) => (p.type === "vsource" ? { ...p, params: { ...p.params, voltage: 3 } } : p));
    const graph = netlistFromGraph(parts, loaded.snapshot.wires);
    const op = computeOperatingPoint(graph)!;
    const source = graph.netlist.elements.find((e) => e.id === graph.inputSourceId)!;
    expect(op.voltages.get(source.nodes[0])).toBeCloseTo(0, 9);
  });

  it("returns null for an empty circuit", () => {
    expect(computeOperatingPoint(netlistFromGraph([], []))).toBeNull();
  });
});

describe("formatVoltage", () => {
  it("formats volts and millivolts compactly", () => {
    expect(formatVoltage(4.5234)).toBe("4.52V");
    expect(formatVoltage(-0.012)).toBe("-12mV");
    expect(formatVoltage(0.0001)).toBe("0V");
    expect(formatVoltage(12.34)).toBe("12.3V");
  });
});
