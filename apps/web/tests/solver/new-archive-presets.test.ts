import { describe, expect, it } from "vitest";
import { runAcAnalysis, logFrequencySweep } from "../../src/core/solver/ac";
import { runTransient } from "../../src/core/solver/transient";
import { generateSineWave } from "../../src/audio/testTone";
import {
  rangemasterStyleTrebleBoostPreset,
  distortionPlusStylePreset,
  octaveFuzzStylePreset,
} from "../../src/core/library/presets/archive";

const SAMPLE_RATE = 48000;
const freqs = logFrequencySweep(20, 20000, 40);

const bandDb = (pts: { frequencyHz: number; magnitudeDb: number }[], lo: number, hi: number) => {
  const b = pts.filter((p) => p.frequencyHz >= lo && p.frequencyHz <= hi);
  return b.reduce((s, p) => s + p.magnitudeDb, 0) / b.length;
};

/** Sign changes about the mean - a cheap way to count output cycles without an FFT. */
function crossings(samples: Float64Array): number {
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  let n = 0;
  for (let i = 1; i < samples.length; i++) if (Math.sign(samples[i] - mean) !== Math.sign(samples[i - 1] - mean)) n++;
  return n;
}

describe("트레블 부스터 (Rangemaster 스타일)", () => {
  const sweep = (inputCapacitance: number) =>
    runAcAnalysis(rangemasterStyleTrebleBoostPreset.build({ ...rangemasterStyleTrebleBoostPreset.defaultParams, inputCapacitance }), {
      inputSourceId: rangemasterStyleTrebleBoostPreset.inputSourceId,
      outputNode: rangemasterStyleTrebleBoostPreset.outputNode,
      frequenciesHz: freqs,
    });

  it("boosts treble while leaving the low end behind", () => {
    const points = sweep(5e-9);
    expect(bandDb(points, 2000, 6000)).toBeGreaterThan(15);
    expect(bandDb(points, 60, 150)).toBeLessThan(5);
  });

  it("becomes a full-range boost when the input cap is enlarged", () => {
    // The tilt is the input cap's doing and nothing else's - that is what makes it a *treble* booster.
    const tilt = (c: number) => bandDb(sweep(c), 2000, 6000) - bandDb(sweep(c), 60, 150);
    expect(tilt(5e-9)).toBeGreaterThan(tilt(100e-9) + 10);
  });
});

describe("디스토션 (Distortion+ 스타일)", () => {
  const peakOut = (amplitude: number) => {
    const { traces } = runTransient(distortionPlusStylePreset.build(distortionPlusStylePreset.defaultParams), {
      inputSourceId: distortionPlusStylePreset.inputSourceId,
      inputSamples: generateSineWave(440, amplitude, SAMPLE_RATE, 0.02),
      sampleRate: SAMPLE_RATE,
      tapNodes: [distortionPlusStylePreset.outputNode],
    });
    return Math.max(...traces.get(distortionPlusStylePreset.outputNode)!);
  };

  it("holds its output at the diode knee however hard it is driven", () => {
    const small = peakOut(0.05);
    const large = peakOut(2);
    // 40x more input for well under 2x more output: the shunt pair is clamping, not compressing.
    expect(large).toBeLessThan(small * 2);
    expect(large).toBeGreaterThan(0.4);
  });
});

describe("옥타브 퍼즈 (트랜스포머 전파 정류)", () => {
  const run = (coupling: number) => {
    const input = generateSineWave(220, 0.3, SAMPLE_RATE, 0.05);
    const { traces } = runTransient(octaveFuzzStylePreset.build({ ...octaveFuzzStylePreset.defaultParams, coupling }), {
      inputSourceId: octaveFuzzStylePreset.inputSourceId,
      inputSamples: input,
      sampleRate: SAMPLE_RATE,
      tapNodes: [octaveFuzzStylePreset.outputNode],
    });
    return { input, output: traces.get(octaveFuzzStylePreset.outputNode)! };
  };

  it("puts out roughly two cycles for every input cycle", () => {
    // The defining property of full-wave rectification, and the reason this sings an octave up.
    const { input, output } = run(0.95);
    expect(crossings(output)).toBeGreaterThan(crossings(input) * 1.7);
  });

  it("loses level as the windings are decoupled, since the octave arrives through the transformer", () => {
    expect(Math.max(...run(0.4).output)).toBeLessThan(Math.max(...run(0.95).output) * 0.6);
  });
});
