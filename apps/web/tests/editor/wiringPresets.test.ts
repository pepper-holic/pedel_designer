import { describe, expect, it } from "vitest";
import { wiringPresets } from "../../src/editor/wiring";
import { netlistFromGraph } from "../../src/editor/netlistFromGraph";
import { runAcAnalysis, logFrequencySweep } from "../../src/core/solver/ac";
import { PART_DEFS } from "../../src/editor/partDefs";

/** Mirrors presets-sanity.test.ts for pedal presets: registering a wiring preset in the array is
 * enough to get it covered, no per-preset test file needed. */
describe.each(wiringPresets.map((p) => [p.name, p] as const))("wiring preset: %s", (_name, preset) => {
  it("references only known part types and only terminals those parts actually have", () => {
    const byId = new Map(preset.snapshot.parts.map((p) => [p.id, p]));
    for (const part of preset.snapshot.parts) expect(PART_DEFS[part.type]).toBeDefined();

    for (const wire of preset.snapshot.wires) {
      for (const end of [wire.a, wire.b]) {
        const part = byId.get(end.partId);
        expect(part, `wire ${wire.id} references missing part ${end.partId}`).toBeDefined();
        expect(PART_DEFS[part!.type].terminals.map((t) => t.id)).toContain(end.terminalId);
      }
    }
  });

  it("has a resolvable output terminal and a usable input source", () => {
    const graph = netlistFromGraph(preset.snapshot.parts, preset.snapshot.wires);
    const outputNet = graph.terminalNet.get(`${preset.outputTerminal.partId}:${preset.outputTerminal.terminalId}`);
    expect(outputNet).toBeDefined();
    expect(graph.netNames).toContain(outputNet);
    expect(graph.inputSourceId).not.toBeNull();
  });

  it("produces a finite frequency response across the audio band", () => {
    const graph = netlistFromGraph(preset.snapshot.parts, preset.snapshot.wires);
    const points = runAcAnalysis(graph.netlist, {
      inputSourceId: graph.inputSourceId!,
      outputNode: graph.terminalNet.get(`${preset.outputTerminal.partId}:${preset.outputTerminal.terminalId}`)!,
      frequenciesHz: logFrequencySweep(20, 20000, 20),
    });
    expect(points.length).toBeGreaterThan(0);
    for (const p of points) expect(Number.isFinite(p.magnitudeDb)).toBe(true);
  });
});

describe("싱글 픽업 + 볼륨 + 톤", () => {
  const preset = wiringPresets.find((p) => p.id === "wiring-single-pickup-vol-tone")!;
  const sweep = (parts: typeof preset.snapshot.parts) => {
    const graph = netlistFromGraph(parts, preset.snapshot.wires);
    return runAcAnalysis(graph.netlist, {
      inputSourceId: graph.inputSourceId!,
      outputNode: graph.terminalNet.get("VOL:wiper")!,
      frequenciesHz: logFrequencySweep(20, 20000, 40),
    });
  };
  const withParam = (partId: string, key: string, value: number) =>
    preset.snapshot.parts.map((p) => (p.id === partId ? { ...p, params: { ...p.params, [key]: value } } : p));

  it("keeps the pickup as a single composite part rather than its expanded elements", () => {
    // This is the whole point of the part-level format: a pickup you can retune with one model
    // dropdown, not four loose parts.
    expect(preset.snapshot.parts.filter((p) => p.type === "pickup")).toHaveLength(1);
    expect(preset.snapshot.parts.filter((p) => p.type === "potentiometer")).toHaveLength(2);
  });

  it("loses level as the volume knob is turned down", () => {
    const at = (position: number) => {
      const points = sweep(withParam("VOL", "position", position));
      return points.reduce((sum, p) => sum + p.magnitudeDb, 0) / points.length;
    };
    expect(at(0.2)).toBeLessThan(at(1));
  });

  it("rolls off treble as the tone knob is turned down", () => {
    const trebleDb = (position: number) => {
      const points = sweep(withParam("TONE", "position", position));
      const highs = points.filter((p) => p.frequencyHz > 3000);
      return highs.reduce((sum, p) => sum + p.magnitudeDb, 0) / highs.length;
    };
    expect(trebleDb(0)).toBeLessThan(trebleDb(1));
  });
});

/** Peak-picking helper shared by the switching tests below. */
function sweepPreset(presetId: string, overrides: Record<string, Record<string, number>> = {}) {
  const preset = wiringPresets.find((p) => p.id === presetId)!;
  const parts = preset.snapshot.parts.map((p) =>
    overrides[p.id] ? { ...p, params: { ...p.params, ...overrides[p.id] } } : p,
  );
  const graph = netlistFromGraph(parts, preset.snapshot.wires);
  const points = runAcAnalysis(graph.netlist, {
    inputSourceId: graph.inputSourceId!,
    outputNode: graph.terminalNet.get(`${preset.outputTerminal.partId}:${preset.outputTerminal.terminalId}`)!,
    frequenciesHz: logFrequencySweep(20, 20000, 60),
  });
  return {
    peakHz: points.reduce((best, p) => (p.magnitudeDb > best.magnitudeDb ? p : best)).frequencyHz,
    midDb: points.find((p) => p.frequencyHz > 400)!.magnitudeDb,
  };
}

describe("험버커 코일 스플릿", () => {
  const id = "wiring-humbucker-coil-split";

  it("raises the resonant peak and drops the level when the split switch shorts one coil", () => {
    const full = sweepPreset(id, { SW_SPLIT: { switchPosition: 0 } });
    const split = sweepPreset(id, { SW_SPLIT: { switchPosition: 1 } });

    // Half the inductance resonates higher...
    expect(split.peakHz).toBeGreaterThan(full.peakHz);
    // ...and half the coil means less output, which is why a split humbucker sounds weaker.
    expect(split.midDb).toBeLessThan(full.midDb);
  });
});

describe("험버커 직렬/병렬 전환", () => {
  const id = "wiring-humbucker-series-parallel";

  it("moves the resonant peak up and the level down when switched from series to parallel", () => {
    const series = sweepPreset(id, { SW_SP: { switchPosition: 0 } });
    const parallel = sweepPreset(id, { SW_SP: { switchPosition: 1 } });

    expect(parallel.peakHz).toBeGreaterThan(series.peakHz);
    expect(parallel.midDb).toBeLessThan(series.midDb);
  });
});
