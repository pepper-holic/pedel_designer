// Profiling entry (not a test): bundled with rolldown and run under `node --cpu-prof`.
import { presets } from "../src/core/library/presets";
import { runTransient } from "../src/core/solver/transient";
import { generateTestSignal } from "../src/audio/testSignals";

const id = process.argv[2] ?? "king-of-tone-style-overdrive";
const os = Number(process.argv[3] ?? 1);
const preset = presets.find((p) => p.id === id)!;
const input = generateTestSignal("chord", 48000).subarray(0, 48000);
const t0 = performance.now();
const r = runTransient(preset.build(preset.defaultParams), { inputSourceId: preset.inputSourceId, inputSamples: input, sampleRate: 48000, tapNodes: [preset.outputNode], oversample: os });
console.log(id, os, ((performance.now() - t0) / 1000).toFixed(3), "s/audio-s", "nonconv", r.nonConvergentSampleCount, "worstDelta", r.worstNonConvergentDelta, "checksum", r.traces.get(preset.outputNode)!.reduce((a, b) => a + b * b, 0).toExponential(6));
