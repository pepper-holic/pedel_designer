import { describe, expect, it } from "vitest";
import { runTransient } from "../../src/core/solver/transient";
import { buildTopology } from "../../src/core/solver/topology";
import { solveNewton } from "../../src/core/solver/newton";
import { voltageAt } from "../../src/core/solver/solution";
import type { PedalPreset } from "../../src/core/library/types";
import {
  ds1StyleDistortionPreset,
  microAmpStyleBoostPreset,
  electraStyleDistortionPreset,
  bazzFussStyleFuzzPreset,
} from "../../src/core/library/presets/archive";

function dcVoltage(preset: PedalPreset, node: string, params = preset.defaultParams): number {
  const netlist = preset.build(params);
  const topology = buildTopology(netlist);
  const { solution, converged } = solveNewton(netlist, topology, new Map(), 0);
  expect(converged).toBe(true);
  return voltageAt(topology, solution, node);
}

/** Output swing at `node` for a constant input held for `samples` steps (so short RC paths settle). */
function swingAt(preset: PedalPreset, node: string, amplitude: number, samples = 1, params = preset.defaultParams): number {
  const r = runTransient(preset.build(params), {
    inputSourceId: preset.inputSourceId,
    inputSamples: new Float64Array(samples).fill(amplitude),
    sampleRate: 48000,
    tapNodes: [node],
  });
  const trace = r.traces.get(node)!;
  return trace[samples - 1] - dcVoltage(preset, node, params);
}

describe("DS-1 style distortion", () => {
  it("biases the transistor booster in its active region", () => {
    const vc = dcVoltage(ds1StyleDistortionPreset, "q2coll");
    expect(vc).toBeGreaterThan(1.5);
    expect(vc).toBeLessThan(7.5);
  });

  it("amplifies a whisper of input by well over 100x and clamps a loud one at the diode knee", () => {
    const small = Math.abs(swingAt(ds1StyleDistortionPreset, "clip", 0.0002, 20)) / 0.0002;
    const loud = Math.abs(swingAt(ds1StyleDistortionPreset, "clip", 0.05, 20));
    expect(small).toBeGreaterThan(100);
    expect(loud).toBeLessThan(1);
    expect(loud / 0.05).toBeLessThan(small * 0.1);
  });

  it("tone knob moves the output between the low-pass and high-pass legs", () => {
    const at = (tone: number, samples: number) => Math.abs(swingAt(ds1StyleDistortionPreset, "out", 0.05, samples, { ...ds1StyleDistortionPreset.defaultParams, tone }));
    // The leading edge of a step is all treble: the high-pass leg passes it, the low-pass leg has
    // barely started to rise. Held for 20 samples the picture inverts - the high-pass leg has decayed
    // and the low-pass leg has charged.
    expect(at(1, 1)).toBeGreaterThan(at(0, 1) * 2);
    expect(at(0, 20)).toBeGreaterThan(at(1, 20) * 2);
  });
});

describe("Micro Amp style boost", () => {
  it("gives about 14x at the default knob and unity with the knob at zero", () => {
    const gain = swingAt(microAmpStyleBoostPreset, "out", 0.01) / 0.01;
    expect(gain).toBeGreaterThan(12);
    expect(gain).toBeLessThan(15);
    const unity = swingAt(microAmpStyleBoostPreset, "out", 0.01, 1, { gainResistance: 50 }) / 0.01;
    expect(unity).toBeGreaterThan(0.9);
    expect(unity).toBeLessThan(1.1);
  });

  it("never caps the maximum gain above the fixed 56k would allow (~20x)", () => {
    const max = swingAt(microAmpStyleBoostPreset, "out", 0.01, 1, { gainResistance: 500_000 }) / 0.01;
    expect(max).toBeLessThan(21);
    expect(max).toBeGreaterThan(17);
  });
});

describe("Electra style distortion", () => {
  it("biases the single stage with the collector in the upper half of the rail", () => {
    const vc = dcVoltage(electraStyleDistortionPreset, "coll");
    expect(vc).toBeGreaterThan(5);
    expect(vc).toBeLessThan(8.5);
  });

  it("clamps the output at the germanium knee once the input is loud", () => {
    const quiet = Math.abs(swingAt(electraStyleDistortionPreset, "out", 0.01)) / 0.01;
    expect(quiet).toBeGreaterThan(4);
    const loud = Math.abs(swingAt(electraStyleDistortionPreset, "out", 0.3));
    expect(loud).toBeLessThan(0.6);
  });
});

describe("Bazz Fuss style fuzz", () => {
  it("sits the collector barely a volt above ground, as the diode bias dictates", () => {
    const vc = dcVoltage(bazzFussStyleFuzzPreset, "coll");
    expect(vc).toBeGreaterThan(0.5);
    expect(vc).toBeLessThan(2);
  });

  it("clips far harder on one half-cycle than the other", () => {
    // Over a 440Hz cycle the positive half saturates the transistor (collector near 0V); the negative
    // half cannot lift the collector much, because the bias diode holds it a diode drop above the base.
    const n = 480;
    const sine = new Float64Array(n);
    for (let i = 0; i < n; i++) sine[i] = 0.3 * Math.sin((2 * Math.PI * 440 * i) / 48000);
    const r = runTransient(bazzFussStyleFuzzPreset.build(bazzFussStyleFuzzPreset.defaultParams), {
      inputSourceId: bazzFussStyleFuzzPreset.inputSourceId,
      inputSamples: sine,
      sampleRate: 48000,
      tapNodes: ["coll"],
    });
    const steady = r.traces.get("coll")!.subarray(n / 2);
    const dc = dcVoltage(bazzFussStyleFuzzPreset, "coll");
    const down = dc - Math.min(...steady);
    const up = Math.max(...steady) - dc;
    expect(Math.min(...steady)).toBeGreaterThan(0);
    expect(Math.max(...steady)).toBeLessThan(1.5);
    expect(down).toBeGreaterThan(up * 2);
  });
});
