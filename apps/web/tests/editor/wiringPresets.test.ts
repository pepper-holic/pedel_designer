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

/** Average magnitude over a frequency band, in dB - the level measure the switching tests compare. */
function bandDb(points: { frequencyHz: number; magnitudeDb: number }[], lowHz: number, highHz: number): number {
  const inBand = points.filter((p) => p.frequencyHz >= lowHz && p.frequencyHz <= highHz);
  return inBand.reduce((sum, p) => sum + p.magnitudeDb, 0) / inBand.length;
}

function sweepPoints(presetId: string, overrides: Record<string, Record<string, number>> = {}) {
  const preset = wiringPresets.find((p) => p.id === presetId)!;
  const parts = preset.snapshot.parts.map((p) =>
    overrides[p.id] ? { ...p, params: { ...p.params, ...overrides[p.id] } } : p,
  );
  const graph = netlistFromGraph(parts, preset.snapshot.wires);
  return runAcAnalysis(graph.netlist, {
    inputSourceId: graph.inputSourceId!,
    outputNode: graph.terminalNet.get(`${preset.outputTerminal.partId}:${preset.outputTerminal.terminalId}`)!,
    frequenciesHz: logFrequencySweep(20, 20000, 60),
  });
}

describe("셀렉터 배선", () => {
  it("3-way의 가운데 위치는 두 픽업을 병렬로 붙여 공진을 올린다", () => {
    const peak = (position: number) => {
      const pts = sweepPoints("wiring-tele-style-3way", { SEL: { switchPosition: position } });
      return pts.reduce((best, p) => (p.magnitudeDb > best.magnitudeDb ? p : best)).frequencyHz;
    };
    // Position 1 bridges both contacts; two pickups in parallel means less inductance than either.
    expect(peak(1)).toBeGreaterThan(peak(0));
    expect(peak(1)).toBeGreaterThan(peak(2));
  });

  it("5-way의 홀수 위치(2·4번)만 두 픽업을 함께 선택한다", () => {
    const preset = wiringPresets.find((p) => p.id === "wiring-strat-style-5way")!;
    const closedCount = (position: number) => {
      const parts = preset.snapshot.parts.map((p) => (p.id === "SEL" ? { ...p, params: { ...p.params, switchPosition: position } } : p));
      return netlistFromGraph(parts, preset.snapshot.wires)
        .netlist.elements.filter((e) => e.type === "resistor" && e.id.startsWith("SEL:in") && e.resistance < 1)
        .length;
    };
    expect([0, 1, 2, 3, 4].map(closedCount)).toEqual([1, 2, 1, 2, 1]);
  });

  it("독립 볼륨 배선은 가운데 위치에서 한쪽 볼륨이 다른 쪽 출력까지 끌어내린다", () => {
    const both = { SEL: { switchPosition: 1 } };
    const full = bandDb(sweepPoints("wiring-lespaul-style-3way", both), 200, 1000);
    const oneRolledOff = bandDb(
      sweepPoints("wiring-lespaul-style-3way", { ...both, VOL_N: { position: 0.02 } }),
      200,
      1000,
    );
    // The rolled-off pot loads the shared output node, so the *other* pickup loses level too.
    expect(oneRolledOff).toBeLessThan(full - 1);
  });
});

describe("위상 반전 스위치", () => {
  it("반전 위치에서 두 픽업이 상쇄해 출력이 크게 줄어든다", () => {
    const inPhase = bandDb(sweepPoints("wiring-out-of-phase", { SW_PHASE: { switchPosition: 0 } }), 200, 2000);
    const outOfPhase = bandDb(sweepPoints("wiring-out-of-phase", { SW_PHASE: { switchPosition: 1 } }), 200, 2000);
    expect(outOfPhase).toBeLessThan(inPhase - 6);
  });
});

describe("트레블 블리드", () => {
  /**
   * Absolute high-frequency level with the volume rolled back, in dB. Measured absolutely rather
   * than relative to the mids on purpose: one of the three networks (cap + parallel resistor) lifts
   * the mids as well, so a treble-minus-mid figure would score it as *worse* even though it passes
   * more treble than the bare pot. What every bleed network is for is having more highs left at a
   * rolled-back setting, and that is what this measures.
   */
  const rolledBackTrebleDb = (presetId: string) => bandDb(sweepPoints(presetId, { VOL: { position: 0.35 } }), 3000, 10000);

  /** How treble-tilted the result is - the character difference between the three networks. */
  const trebleTilt = (presetId: string) => {
    const pts = sweepPoints(presetId, { VOL: { position: 0.35 } });
    return bandDb(pts, 3000, 10000) - bandDb(pts, 200, 500);
  };

  it("세 방식 모두 볼륨을 내렸을 때 고음을 기준 회로보다 많이 남긴다", () => {
    const none = rolledBackTrebleDb("wiring-treble-bleed-none");
    for (const id of [
      "wiring-treble-bleed-cap",
      "wiring-treble-bleed-cap-parallel-r",
      "wiring-treble-bleed-cap-series-r",
    ]) {
      expect(rolledBackTrebleDb(id), `${id} should leave more treble than the bare pot`).toBeGreaterThan(none + 3);
    }
  });

  it("캡만 쓰는 방식이 가장 고음 쪽으로 기울고, 병렬 저항 방식이 가장 덜 기운다", () => {
    // The parallel resistor passes every frequency, so it lifts the mids too and the result stays
    // closer to the pot's own balance - which is exactly why it is described as the more natural
    // taper. The bare cap only passes highs, so it tilts the most.
    expect(trebleTilt("wiring-treble-bleed-cap")).toBeGreaterThan(trebleTilt("wiring-treble-bleed-cap-series-r"));
    expect(trebleTilt("wiring-treble-bleed-cap-series-r")).toBeGreaterThan(trebleTilt("wiring-treble-bleed-cap-parallel-r"));
  });
});
