import { describe, expect, it } from "vitest";
import { sweepCandidates, sweepParameter } from "../../src/editor/paramSweep";
import { wiringPresets } from "../../src/editor/wiring";
import { netlistFromGraph } from "../../src/editor/netlistFromGraph";
import { logFrequencySweep } from "../../src/core/solver/ac";

const freqs = logFrequencySweep(20, 20000, 30);

function presetGraph(id: string) {
  const preset = wiringPresets.find((p) => p.id === id)!;
  const graph = netlistFromGraph(preset.snapshot.parts, preset.snapshot.wires);
  const outputNode = graph.terminalNet.get(`${preset.outputTerminal.partId}:${preset.outputTerminal.terminalId}`)!;
  return { preset, outputNode };
}

const bandDb = (points: { frequencyHz: number; magnitudeDb: number }[], lo: number, hi: number) => {
  const b = points.filter((p) => p.frequencyHz >= lo && p.frequencyHz <= hi);
  return b.reduce((s, p) => s + p.magnitudeDb, 0) / b.length;
};

describe("sweepCandidates", () => {
  it("offers every pot and switch on the canvas, and nothing else", () => {
    const { preset } = presetGraph("wiring-single-pickup-vol-tone");
    const ids = sweepCandidates(preset.snapshot.parts).map((c) => c.partId).sort();
    expect(ids).toEqual(["TONE", "VOL"]);
  });

  it("gives a switch one step per real detent rather than a continuous range", () => {
    const { preset } = presetGraph("wiring-strat-style-5way");
    const blade = sweepCandidates(preset.snapshot.parts).find((c) => c.partId === "SEL")!;
    expect(blade.paramKey).toBe("switchPosition");
    expect(blade.values).toEqual([0, 1, 2, 3, 4]);
  });
});

describe("sweepParameter", () => {
  it("returns one curve per swept value, all on the same frequency grid", () => {
    const { preset, outputNode } = presetGraph("wiring-single-pickup-vol-tone");
    const target = sweepCandidates(preset.snapshot.parts).find((c) => c.partId === "TONE")!;
    const curves = sweepParameter(preset.snapshot.parts, preset.snapshot.wires, outputNode, target, freqs);

    expect(curves).toHaveLength(target.values.length);
    for (const curve of curves) expect(curve.points).toHaveLength(freqs.length);
  });

  it("shows the tone knob progressively cutting treble as it is turned down", () => {
    const { preset, outputNode } = presetGraph("wiring-single-pickup-vol-tone");
    const target = sweepCandidates(preset.snapshot.parts).find((c) => c.partId === "TONE")!;
    const curves = sweepParameter(preset.snapshot.parts, preset.snapshot.wires, outputNode, target, freqs);

    const trebleByValue = curves.map((c) => ({ value: c.value, treble: bandDb(c.points, 3000, 10000) }));
    const sorted = [...trebleByValue].sort((a, b) => a.value - b.value);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].treble, `tone ${sorted[i].value} should keep more treble than ${sorted[i - 1].value}`).toBeGreaterThan(
        sorted[i - 1].treble,
      );
    }
  });

  it("follows the output through a topology change rather than a stale net name", () => {
    // Switch positions rewire the circuit, so the sweep re-resolves the output terminal on every
    // step instead of trusting the net name the user picked in the base circuit.
    const { preset, outputNode } = presetGraph("wiring-humbucker-series-parallel");
    const target = sweepCandidates(preset.snapshot.parts).find((c) => c.partId === "SW_SP")!;
    const curves = sweepParameter(preset.snapshot.parts, preset.snapshot.wires, outputNode, target, freqs);

    expect(curves).toHaveLength(2);
    for (const curve of curves) {
      expect(curve.points.every((p) => Number.isFinite(p.magnitudeDb))).toBe(true);
    }
    // Parallel is the quieter of the two - if the output had been lost the curves would be identical.
    expect(bandDb(curves[1].points, 200, 1000)).toBeLessThan(bandDb(curves[0].points, 200, 1000));
  });
});
