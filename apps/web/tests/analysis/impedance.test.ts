import { describe, expect, it } from "vitest";
import { sourceLoadImpedanceSweep } from "../../src/core/analysis/impedance";
import { logFrequencySweep } from "../../src/core/solver/ac";
import { netlistFromGraph } from "../../src/editor/netlistFromGraph";
import { wiringPresets } from "../../src/editor/wiring";
import type { PartInstance, Wire } from "../../src/editor/types";

const freqs = logFrequencySweep(20, 20000, 20);

/** A bare resistor to ground - the simplest thing with a known input impedance. */
function resistorToGround(ohms: number): { parts: PartInstance[]; wires: Wire[] } {
  return {
    parts: [
      { id: "V1", type: "vsource", x: 0, y: 0, rotation: 0, params: { voltage: 0 }, role: "signalSource" },
      { id: "R1", type: "resistor", x: 100, y: 0, rotation: 0, params: { resistance: ohms } },
      { id: "G1", type: "ground", x: 0, y: 100, rotation: 0, params: {} },
    ],
    wires: [
      { id: "w1", a: { partId: "V1", terminalId: "positive" }, b: { partId: "R1", terminalId: "a" } },
      { id: "w2", a: { partId: "R1", terminalId: "b" }, b: { partId: "G1", terminalId: "gnd" } },
      { id: "w3", a: { partId: "V1", terminalId: "negative" }, b: { partId: "G1", terminalId: "gnd" } },
    ],
  };
}

const at = (points: { frequencyHz: number; magnitudeOhms: number }[], hz: number) =>
  points.reduce((best, p) => (Math.abs(p.frequencyHz - hz) < Math.abs(best.frequencyHz - hz) ? p : best)).magnitudeOhms;

describe("sourceLoadImpedanceSweep", () => {
  it("reads back a plain resistor's value, flat across the band", () => {
    const { parts, wires } = resistorToGround(47_000);
    const graph = netlistFromGraph(parts, wires);
    const points = sourceLoadImpedanceSweep(graph.netlist, graph.inputSourceId!, freqs);

    expect(at(points, 100)).toBeCloseTo(47_000, -1);
    expect(at(points, 10_000)).toBeCloseTo(47_000, -1);
  });

  it("returns one point per requested frequency, all finite", () => {
    const { parts, wires } = resistorToGround(1_000_000);
    const graph = netlistFromGraph(parts, wires);
    const points = sourceLoadImpedanceSweep(graph.netlist, graph.inputSourceId!, freqs);

    expect(points).toHaveLength(freqs.length);
    expect(points.every((p) => Number.isFinite(p.magnitudeOhms) && p.magnitudeOhms > 0)).toBe(true);
  });

  it("shows a low-impedance pedal input dragging the source down, and a buffer preventing it", () => {
    // This is the number behind every "should I put a buffer first?" argument: the same guitar
    // driving the same transistor stage sees an order of magnitude less impedance without a buffer
    // in between, and that loading is what changes the tone.
    const impedanceAt = (presetId: string, hz: number) => {
      const preset = wiringPresets.find((p) => p.id === presetId)!;
      const graph = netlistFromGraph(preset.snapshot.parts, preset.snapshot.wires);
      return at(sourceLoadImpedanceSweep(graph.netlist, graph.inputSourceId!, freqs), hz);
    };

    for (const hz of [100, 1000]) {
      expect(impedanceAt("wiring-guitar-into-buffered-input", hz)).toBeGreaterThan(
        impedanceAt("wiring-guitar-into-fuzz-input", hz) * 5,
      );
    }
  });
});
