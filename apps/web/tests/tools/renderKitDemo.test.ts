/**
 * Listening demo for kit circuits, not a regression test: skipped unless RENDER_IN is set.
 *   RENDER_IN  raw little-endian float32 mono guitar DI at 48 kHz, in volts (pickup open-circuit)
 *   RENDER_OUT folder for the WAVs and render.json
 * Each kit runs at the knob settings in VARIATIONS, through a humbucker-and-cable source impedance,
 * and the output is written direct and through the generic 4x12 cabinet IR at equal loudness.
 * See .claude/skills/pcb-to-netlist/SKILL.md for preparing the DI.
 */
import { it } from "vitest";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { kitPresets } from "../../src/core/library/kits";
import { runTransient } from "../../src/core/solver/transient";
import { logFrequencySweep, runAcAnalysis } from "../../src/core/solver/ac";
import { generateCabinetIr } from "../../src/audio/cabinetIr";
import { applyTaper } from "../../src/editor/taper";
import type { Netlist } from "../../src/core/solver/types";
import type { KnobSpec } from "../../src/core/library/types";
import { PAF_STYLE_HUMBUCKER } from "../../src/core/library/deviceModels";

/** The DI recording is the pickup's open-circuit voltage; a pedal sees it through the pickup's own
 * coil resistance and inductance (and the cable's capacitance), which matters a great deal for a
 * low-input-impedance circuit like a Fuzz Face. */
function withPickup(netlist: Netlist, sourceId: string): Netlist {
  const els = netlist.elements.map((e) => (e.id === sourceId ? { ...e, nodes: ["pu", e.nodes[1]] } : e)) as Netlist["elements"];
  els.push(
    { id: "PU_R", type: "resistor", nodes: ["pu", "pu_l"], resistance: PAF_STYLE_HUMBUCKER.dcResistance },
    { id: "PU_L", type: "inductor", nodes: ["pu_l", "in"], inductance: PAF_STYLE_HUMBUCKER.inductance },
    { id: "PU_C", type: "capacitor", nodes: ["in", "0"], capacitance: PAF_STYLE_HUMBUCKER.selfCapacitance + 500e-12 },
  );
  return { elements: els };
}

const SR = 48000;
const OUT = process.env.RENDER_OUT!;
const INPUT = process.env.RENDER_IN!;

/** Neutral = every knob at noon; each variation moves one knob. */
const VARIATIONS: Record<string, { name: string; knobs: Record<string, number> }[]> = {
  "pp-fuzzy-face": [
    { name: "neutral", knobs: { FUZZ: 0.5, VOLUME: 0.5 } },
    { name: "fuzz-low", knobs: { FUZZ: 0.15, VOLUME: 0.5 } },
    { name: "fuzz-max", knobs: { FUZZ: 1, VOLUME: 0.5 } },
  ],
  "pp-cdos": [
    { name: "neutral", knobs: { DRIVE: 0.5, BASS: 0.5, TREBLE: 0.5, LEVEL: 0.5 } },
    { name: "drive-low", knobs: { DRIVE: 0.15, BASS: 0.5, TREBLE: 0.5, LEVEL: 0.5 } },
    { name: "drive-max", knobs: { DRIVE: 1, BASS: 0.5, TREBLE: 0.5, LEVEL: 0.5 } },
    { name: "treble-low", knobs: { DRIVE: 0.5, BASS: 0.5, TREBLE: 0.15, LEVEL: 0.5 } },
    { name: "treble-high", knobs: { DRIVE: 0.5, BASS: 0.5, TREBLE: 0.85, LEVEL: 0.5 } },
  ],
};

function withKnobs(netlist: Netlist, positions: Record<string, number>, knobs: KnobSpec[]): Netlist {
  const els = netlist.elements.map((e) => ({ ...e }));
  const set = (id: string, r: number) => {
    const el = els.find((e) => e.id === id);
    if (el?.type === "resistor") el.resistance = Math.max(r, 1);
  };
  for (const k of knobs) {
    if (!(k.id in positions)) continue;
    const f = applyTaper(k.taper ?? "B", positions[k.id]);
    if (k.kind === "pot") {
      const a = els.find((e) => e.id === k.upper)!;
      const b = els.find((e) => e.id === k.lower)!;
      if (a.type !== "resistor" || b.type !== "resistor") continue;
      const total = a.resistance + b.resistance;
      set(k.upper, total * f);
      set(k.lower, total * (1 - f));
    } else {
      set(k.element, k.maxResistance * (k.reverse ? 1 - f : f));
    }
  }
  return { elements: els };
}

function convolve(x: Float64Array, ir: Float32Array): Float64Array {
  const y = new Float64Array(x.length);
  for (let i = 0; i < x.length; i++) {
    let s = 0;
    const m = Math.min(ir.length, i + 1);
    for (let k = 0; k < m; k++) s += ir[k] * x[i - k];
    y[i] = s;
  }
  return y;
}

function highpass(x: Float64Array, hz: number): Float64Array {
  const rc = 1 / (2 * Math.PI * hz), dt = 1 / SR, a = rc / (rc + dt);
  const y = new Float64Array(x.length);
  for (let i = 1; i < x.length; i++) y[i] = a * (y[i - 1] + x[i] - x[i - 1]);
  return y;
}

const rms = (x: Float64Array) => Math.sqrt(x.reduce((s, v) => s + v * v, 0) / x.length);

/** Equal loudness across files (so knob changes are heard as tone, not level), never clipping. */
function writeWav(path: string, x: Float64Array): void {
  let peak = 0;
  for (const v of x) peak = Math.max(peak, Math.abs(v));
  const g = Math.min(0.12 / Math.max(rms(x), 1e-9), 0.97 / Math.max(peak, 1e-9));
  const data = Buffer.alloc(44 + x.length * 2);
  data.write("RIFF", 0);
  data.writeUInt32LE(36 + x.length * 2, 4);
  data.write("WAVEfmt ", 8);
  data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20);
  data.writeUInt16LE(1, 22);
  data.writeUInt32LE(SR, 24);
  data.writeUInt32LE(SR * 2, 28);
  data.writeUInt16LE(2, 32);
  data.writeUInt16LE(16, 34);
  data.write("data", 36);
  data.writeUInt32LE(x.length * 2, 40);
  for (let i = 0; i < x.length; i++) data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, x[i] * g)) * 32767), 44 + i * 2);
  writeFileSync(path, data);
}

it.skipIf(!INPUT)("renders kit demos", { timeout: 3_600_000 }, () => {
  mkdirSync(OUT, { recursive: true });
  const raw = readFileSync(INPUT);
  const di = Float64Array.from(new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4));
  const ir = generateCabinetIr(SR, "brightCab4x12");
  const report: Record<string, unknown> = {};
  writeWav(`${OUT}/guitar_DI.wav`, di);
  writeWav(`${OUT}/guitar_DI_cab.wav`, convolve(di, ir));
  const s = Math.round(1.0 * SR);
  report.di = Array.from(di.subarray(s, s + 4800));
  for (const preset of kitPresets) {
    for (const v of VARIATIONS[preset.id] ?? []) {
      const t0 = Date.now();
      const netlist = withPickup(withKnobs(preset.build({}), v.knobs, preset.knobs ?? []), preset.inputSourceId);
      const r = runTransient(netlist, { inputSourceId: preset.inputSourceId, inputSamples: di, sampleRate: SR, tapNodes: [preset.outputNode], oversample: 2 });
      const out = highpass(r.traces.get(preset.outputNode)!, 20);
      const tag = `${preset.id}_${v.name}`;
      writeWav(`${OUT}/${tag}_cab.wav`, convolve(out, ir));
      if (v.name === "neutral") writeWav(`${OUT}/${tag}_direct.wav`, out);
      const ac = runAcAnalysis(withKnobs(preset.build({}), v.knobs, preset.knobs ?? []), { inputSourceId: preset.inputSourceId, outputNode: preset.outputNode, frequenciesHz: logFrequencySweep(20, 20000, 24) });
      report[tag] = { ac: ac.map((p) => [p.frequencyHz, p.magnitudeDb]), knobs: v.knobs, outRmsV: rms(out), seconds: (Date.now() - t0) / 1000, nonConvergent: r.nonConvergentSampleCount, wave: Array.from(out.subarray(s, s + 4800)), full: Array.from(out.filter((_, i) => i % 4 === 0)) };
    }
  }
  writeFileSync(`${OUT}/render.json`, JSON.stringify(report));
});
