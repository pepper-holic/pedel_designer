import { describe, expect, it } from "vitest";
import { presets } from "../../src/core/library/presets";
import { runTransient } from "../../src/core/solver/transient";
import { runAcAnalysis, logFrequencySweep } from "../../src/core/solver/ac";

describe("Every preset in the library", () => {
  for (const preset of presets) {
    it(`${preset.id}: simulates a short waveform and an AC sweep without NaN/Infinity`, () => {
      const netlist = preset.build(preset.defaultParams);

      const inputSamples = new Float64Array(64).map((_, i) => 0.3 * Math.sin((2 * Math.PI * 5 * i) / 64));
      const { traces } = runTransient(netlist, {
        inputSourceId: preset.inputSourceId,
        inputSamples,
        sampleRate: 48000,
        tapNodes: preset.tapNodes,
      });

      for (const node of preset.tapNodes) {
        const trace = traces.get(node)!;
        expect(trace.length).toBe(inputSamples.length);
        for (const v of trace) {
          expect(Number.isFinite(v)).toBe(true);
        }
      }

      const acNetlist = preset.build(preset.defaultParams);
      const points = runAcAnalysis(acNetlist, {
        inputSourceId: preset.inputSourceId,
        outputNode: preset.outputNode,
        frequenciesHz: logFrequencySweep(20, 20000, 5),
      });
      for (const p of points) {
        expect(Number.isFinite(p.magnitudeDb)).toBe(true);
        expect(Number.isFinite(p.phaseDeg)).toBe(true);
      }
    });
  }
});
