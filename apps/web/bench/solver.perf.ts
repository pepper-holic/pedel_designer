/**
 * Solver throughput benchmark: seconds of CPU per second of audio, per representative preset, at
 * the oversampling the "시뮬레이션 실행" path really uses (4x) and at 1x. Run with `npm run bench`.
 *
 * Not part of `npm test` - timings are machine-dependent, so this reports rather than asserts.
 * docs/plan-core-fundamentals.md §1 records the baseline this is compared against (Stage D-1).
 */
import { it } from "vitest";
import { presets } from "../src/core/library/presets";
import { runTransient } from "../src/core/solver/transient";
import { generateTestSignal } from "../src/audio/testSignals";

const SAMPLE_RATE = 48000;
const AUDIO_SECONDS = 1;
const PRESET_IDS = [
  "buffer",
  "ts9-overdrive",
  "rat-style-distortion",
  "klon-style-blend",
  "big-muff-style-fuzz",
  "king-of-tone-style-overdrive",
  "tonebender-mk3-style-fuzz",
];

it("solver throughput", { timeout: 600_000 }, () => {
  const input = generateTestSignal("chord", SAMPLE_RATE).subarray(0, SAMPLE_RATE * AUDIO_SECONDS);
  const rows: string[] = ["preset                          elems  os   s/audio-s   realtime   non-conv"];
  for (const id of PRESET_IDS) {
    const preset = presets.find((p) => p.id === id);
    if (!preset) throw new Error(`benchmark preset missing: ${id}`);
    for (const oversample of [1, 4]) {
      const netlist = preset.build(preset.defaultParams);
      const t0 = performance.now();
      const result = runTransient(netlist, {
        inputSourceId: preset.inputSourceId,
        inputSamples: input,
        sampleRate: SAMPLE_RATE,
        tapNodes: [preset.outputNode],
        oversample,
      });
      const seconds = (performance.now() - t0) / 1000 / AUDIO_SECONDS;
      rows.push(
        `${id.padEnd(32)}${String(netlist.elements.length).padStart(5)}  ${oversample}x ${seconds.toFixed(3).padStart(10)} ${`x${(1 / seconds).toFixed(2)}`.padStart(10)} ${String(result.nonConvergentSampleCount).padStart(10)}`,
      );
    }
  }
  process.stdout.write(`\n${rows.join("\n")}\n\n`);
});
