import { describe, expect, it } from "vitest";
import { runTransient } from "../../src/core/solver/transient";
import { runAcAnalysis, logFrequencySweep } from "../../src/core/solver/ac";
import { bigMuffStyleFuzzPreset, bossStyleOverdrivePreset } from "../../src/core/library/presets/archive";

describe("Archive preset: Big Muff-style fuzz", () => {
  it("clips a large input at each collector stage (swing well below what an unclipped BJT stage would produce)", () => {
    const netlist = bigMuffStyleFuzzPreset.build(bigMuffStyleFuzzPreset.defaultParams);
    const inputSamples = new Float64Array([0.5]); // large enough to drive both stages into clipping
    const { traces } = runTransient(netlist, {
      inputSourceId: bigMuffStyleFuzzPreset.inputSourceId,
      inputSamples,
      sampleRate: 48000,
      tapNodes: ["c1", "c2", "outAC"],
    });

    // Diode-shunted collector nodes should be pinned near a diode drop (~0.6-0.7V) away from
    // ground, not swinging toward the 9V rail the way an unclipped common-emitter stage would.
    expect(Math.abs(traces.get("c1")![0])).toBeLessThan(1.5);
    expect(Math.abs(traces.get("c2")![0])).toBeLessThan(1.5);
    expect(Number.isFinite(traces.get("outAC")![0])).toBe(true);
  });

  it("passes a small signal through with far less relative compression than a large one", () => {
    const netlist = bigMuffStyleFuzzPreset.build(bigMuffStyleFuzzPreset.defaultParams);

    const small = runTransient(netlist, {
      inputSourceId: bigMuffStyleFuzzPreset.inputSourceId,
      inputSamples: new Float64Array([0.002]),
      sampleRate: 48000,
      tapNodes: ["c1"],
    });
    const large = runTransient(netlist, {
      inputSourceId: bigMuffStyleFuzzPreset.inputSourceId,
      inputSamples: new Float64Array([0.5]),
      sampleRate: 48000,
      tapNodes: ["c1"],
    });

    // 250x input increase should NOT produce anywhere near a 250x swing at a clipped collector node.
    const smallSwing = Math.abs(small.traces.get("c1")![0]);
    const largeSwing = Math.abs(large.traces.get("c1")![0]);
    expect(largeSwing / smallSwing).toBeLessThan(50);
  });

  it("tone knob changes the high-frequency response (brighter setting passes more treble)", () => {
    const dark = bigMuffStyleFuzzPreset.build({ ...bigMuffStyleFuzzPreset.defaultParams, tone: 0 });
    const bright = bigMuffStyleFuzzPreset.build({ ...bigMuffStyleFuzzPreset.defaultParams, tone: 1 });
    const freqs = logFrequencySweep(2000, 8000, 4);

    const darkPoints = runAcAnalysis(dark, { inputSourceId: bigMuffStyleFuzzPreset.inputSourceId, outputNode: "outAC", frequenciesHz: freqs });
    const brightPoints = runAcAnalysis(bright, { inputSourceId: bigMuffStyleFuzzPreset.inputSourceId, outputNode: "outAC", frequenciesHz: freqs });

    const darkHighFreqMag = darkPoints[darkPoints.length - 1].magnitudeDb;
    const brightHighFreqMag = brightPoints[brightPoints.length - 1].magnitudeDb;
    expect(brightHighFreqMag).toBeGreaterThan(darkHighFreqMag);
  });
});

describe("Archive preset: Boss-style overdrive", () => {
  it("clips a large input well below the linear (unclipped) gain prediction", () => {
    const netlist = bossStyleOverdrivePreset.build(bossStyleOverdrivePreset.defaultParams);
    const linearGain = bossStyleOverdrivePreset.defaultParams.feedbackResistance / bossStyleOverdrivePreset.defaultParams.inputResistance;

    const inputSamples = new Float64Array([2]);
    const { traces } = runTransient(netlist, {
      inputSourceId: bossStyleOverdrivePreset.inputSourceId,
      inputSamples,
      sampleRate: 48000,
      tapNodes: ["stage1out", "out"],
    });

    const unclippedPrediction = 2 * linearGain;
    expect(Math.abs(traces.get("stage1out")![0])).toBeLessThan(unclippedPrediction * 0.1);
  });

  it("passes a small signal through close to the linear gain (no clipping yet)", () => {
    const netlist = bossStyleOverdrivePreset.build(bossStyleOverdrivePreset.defaultParams);
    const linearGain = bossStyleOverdrivePreset.defaultParams.feedbackResistance / bossStyleOverdrivePreset.defaultParams.inputResistance;

    const inputSamples = new Float64Array([0.0005]);
    const { traces } = runTransient(netlist, {
      inputSourceId: bossStyleOverdrivePreset.inputSourceId,
      inputSamples,
      sampleRate: 48000,
      tapNodes: ["stage1out"],
    });

    expect(traces.get("stage1out")![0]).toBeCloseTo(-0.0005 * linearGain, 3);
  });

  it("output buffer tracks the tone node at unity gain", () => {
    const netlist = bossStyleOverdrivePreset.build(bossStyleOverdrivePreset.defaultParams);
    const inputSamples = new Float64Array([0.005]);
    const { traces } = runTransient(netlist, {
      inputSourceId: bossStyleOverdrivePreset.inputSourceId,
      inputSamples,
      sampleRate: 48000,
      tapNodes: ["tone", "out"],
    });

    expect(traces.get("out")![0]).toBeCloseTo(traces.get("tone")![0], 6);
  });

  it("tone knob changes the high-frequency response (brighter setting passes more treble)", () => {
    const dark = bossStyleOverdrivePreset.build({ ...bossStyleOverdrivePreset.defaultParams, tone: 0 });
    const bright = bossStyleOverdrivePreset.build({ ...bossStyleOverdrivePreset.defaultParams, tone: 1 });
    const freqs = logFrequencySweep(2000, 8000, 4);

    const darkPoints = runAcAnalysis(dark, { inputSourceId: bossStyleOverdrivePreset.inputSourceId, outputNode: "out", frequenciesHz: freqs });
    const brightPoints = runAcAnalysis(bright, { inputSourceId: bossStyleOverdrivePreset.inputSourceId, outputNode: "out", frequenciesHz: freqs });

    const darkHighFreqMag = darkPoints[darkPoints.length - 1].magnitudeDb;
    const brightHighFreqMag = brightPoints[brightPoints.length - 1].magnitudeDb;
    expect(brightHighFreqMag).toBeGreaterThan(darkHighFreqMag);
  });
});
