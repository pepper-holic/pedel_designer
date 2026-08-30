import { describe, expect, it } from "vitest";
import { kingOfToneStyleOverdrivePreset } from "../../src/core/library/presets/archive/king-of-tone-style-overdrive";
import { runTransient } from "../../src/core/solver/transient";
import { runAcAnalysis, logFrequencySweep } from "../../src/core/solver/ac";

/** presets-sanity.test.ts only exercises defaultParams (clipMode: 0) - this covers the other branch
 * of the preset's clipMode switch (1 = output-shunt hard clipping) since it changes the element
 * list shape entirely rather than just a numeric value. */
describe("kingOfToneStyleOverdrivePreset with clipMode: 1 (output-shunt clipping)", () => {
  const params = { ...kingOfToneStyleOverdrivePreset.defaultParams, clipMode: 1 };

  it("simulates a short waveform without NaN/Infinity", () => {
    const netlist = kingOfToneStyleOverdrivePreset.build(params);
    const inputSamples = new Float64Array(64).map((_, i) => 0.3 * Math.sin((2 * Math.PI * 5 * i) / 64));
    const { traces } = runTransient(netlist, {
      inputSourceId: kingOfToneStyleOverdrivePreset.inputSourceId,
      inputSamples,
      sampleRate: 48000,
      tapNodes: kingOfToneStyleOverdrivePreset.tapNodes,
    });
    for (const node of kingOfToneStyleOverdrivePreset.tapNodes) {
      for (const v of traces.get(node)!) expect(Number.isFinite(v)).toBe(true);
    }
  });

  it("runs an AC sweep without NaN/Infinity", () => {
    const netlist = kingOfToneStyleOverdrivePreset.build(params);
    const points = runAcAnalysis(netlist, {
      inputSourceId: kingOfToneStyleOverdrivePreset.inputSourceId,
      outputNode: kingOfToneStyleOverdrivePreset.outputNode,
      frequenciesHz: logFrequencySweep(20, 20000, 5),
    });
    for (const p of points) {
      expect(Number.isFinite(p.magnitudeDb)).toBe(true);
      expect(Number.isFinite(p.phaseDeg)).toBe(true);
    }
  });
});
