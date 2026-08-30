import { describe, expect, it } from "vitest";
import { ocdStyleOverdrivePreset } from "../../src/core/library/presets/archive/ocd-style-overdrive";
import { runTransient } from "../../src/core/solver/transient";
import { runAcAnalysis, logFrequencySweep } from "../../src/core/solver/ac";

/** presets-sanity.test.ts only exercises defaultParams (brightSwitch: 0) - this covers the other
 * branch of the preset's brightSwitch toggle (1 = adds a bypass cap across the clipping resistor),
 * which changes the element list shape rather than just a numeric value. */
describe("ocdStyleOverdrivePreset with brightSwitch: 1 (treble-bleed bypass cap)", () => {
  const params = { ...ocdStyleOverdrivePreset.defaultParams, brightSwitch: 1 };

  it("simulates a short waveform without NaN/Infinity", () => {
    const netlist = ocdStyleOverdrivePreset.build(params);
    const inputSamples = new Float64Array(64).map((_, i) => 0.3 * Math.sin((2 * Math.PI * 5 * i) / 64));
    const { traces } = runTransient(netlist, {
      inputSourceId: ocdStyleOverdrivePreset.inputSourceId,
      inputSamples,
      sampleRate: 48000,
      tapNodes: ocdStyleOverdrivePreset.tapNodes,
    });
    for (const node of ocdStyleOverdrivePreset.tapNodes) {
      for (const v of traces.get(node)!) expect(Number.isFinite(v)).toBe(true);
    }
  });

  it("runs an AC sweep without NaN/Infinity", () => {
    const netlist = ocdStyleOverdrivePreset.build(params);
    const points = runAcAnalysis(netlist, {
      inputSourceId: ocdStyleOverdrivePreset.inputSourceId,
      outputNode: ocdStyleOverdrivePreset.outputNode,
      frequenciesHz: logFrequencySweep(20, 20000, 5),
    });
    for (const p of points) {
      expect(Number.isFinite(p.magnitudeDb)).toBe(true);
      expect(Number.isFinite(p.phaseDeg)).toBe(true);
    }
  });
});
