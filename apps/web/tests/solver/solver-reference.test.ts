import { describe, expect, it } from "vitest";
import { presets } from "../../src/core/library/presets";
import { runTransient } from "../../src/core/solver/transient";
import { generateTestSignal } from "../../src/audio/testSignals";
import reference from "../fixtures/transient-reference.json";

/**
 * Guards solver refactors for speed (Stage D-1): every preset, three integration settings, must give
 * the same samples as the solver did before the optimisation was written. Recorded with the original
 * dense-allocate-per-iteration solver; regenerate only for a deliberate change to the maths.
 */
const input = generateTestSignal("chord", 48000).subarray(0, 3000);
const ref = reference as Record<string, number[]>;

/**
 * Converging presets match to 1nV even with the solver's 1µV stopping tolerance (Newton converges
 * quadratically, so the last step lands far inside it).
 *
 * The Tone Bender is the exception: from about sample 1630 its two-junction feedback loop has no
 * solution Newton can settle on for a handful of samples (reported to the user as non-converged),
 * and everything after depends on the exact iteration path. Before that it must match; after it,
 * only that the output stays finite and bounded.
 */
const CHAOTIC_FROM: Record<string, number> = { "tonebender-mk3-style-fuzz": 1600 };

describe.each(presets.map((p) => [p.id, p] as const))("transient output of %s matches the reference", (_id, preset) => {
  it.each([
    [1, "backwardEuler"],
    [4, "backwardEuler"],
    [2, "trapezoidal"],
  ] as const)("oversample %i, %s", (oversample, integration) => {
    const r = runTransient(preset.build(preset.defaultParams), {
      inputSourceId: preset.inputSourceId,
      inputSamples: input,
      sampleRate: 48000,
      tapNodes: [preset.outputNode],
      oversample,
      integration,
    });
    const trace = r.traces.get(preset.outputNode)!;
    const expected = ref[`${preset.id}|${oversample}|${integration}`];
    expected.forEach((v, k) => {
      const index = k * 100 + 50;
      const got = trace[index];
      if (index >= (CHAOTIC_FROM[preset.id] ?? Infinity)) {
        expect(Number.isFinite(got) && Math.abs(got) < 20, `sample ${index}`).toBe(true);
        return;
      }
      expect(Math.abs(got - v), `sample ${index}`).toBeLessThanOrEqual(1e-9 + 1e-9 * Math.abs(v));
    });
  });
});
