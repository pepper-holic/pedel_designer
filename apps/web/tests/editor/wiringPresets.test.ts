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

/** Frequency and depth of the deepest dip in a response - what a notch filter is characterised by. */
function deepestNotch(points: { frequencyHz: number; magnitudeDb: number }[]) {
  const worst = points.reduce((w, p) => (p.magnitudeDb < w.magnitudeDb ? p : w));
  return { hz: worst.frequencyHz, db: worst.magnitudeDb };
}

describe("50s 배선 vs 모던 배선", () => {
  it("볼륨을 내렸을 때 50s 배선이 고음을 더 남긴다", () => {
    const treble = (id: string) => bandDb(sweepPoints(id), 3000, 10000);
    const mid = (id: string) => bandDb(sweepPoints(id), 200, 500);
    // Same pickup, pots, cap and load - only which lug the tone circuit hangs off differs.
    expect(treble("wiring-50s-tone-feed")).toBeGreaterThan(treble("wiring-modern-tone-feed") + 1);
    // The mids are essentially untouched, so this really is a treble difference and not just level.
    expect(Math.abs(mid("wiring-50s-tone-feed") - mid("wiring-modern-tone-feed"))).toBeLessThan(1);
  });
});

describe("스위치 응용 배선", () => {
  it("킬 스위치를 닫으면 출력이 사실상 사라진다", () => {
    const open = bandDb(sweepPoints("wiring-kill-switch-noload-tone"), 200, 2000);
    const closed = bandDb(sweepPoints("wiring-kill-switch-noload-tone", { SW_KILL: { switchPosition: 1 } }), 200, 2000);
    expect(closed).toBeLessThan(open - 100);
  });

  it("노로드 스위치를 열면 톤 회로가 픽업에서 완전히 떨어져 고음이 돌아온다", () => {
    const engaged = { TONE: { position: 0.3 } };
    const withTone = bandDb(sweepPoints("wiring-kill-switch-noload-tone", engaged), 3000, 10000);
    const noLoad = bandDb(sweepPoints("wiring-kill-switch-noload-tone", { ...engaged, SW_NOLOAD: { switchPosition: 0 } }), 3000, 10000);
    expect(noLoad).toBeGreaterThan(withTone + 10);
  });

  it("로터리는 캡이 커질수록 더 깎고, 마지막 단은 톤 회로를 끊어 가장 덜 깎는다", () => {
    const cut = (position: number) => bandDb(sweepPoints("wiring-rotary-tone-caps", { SEL_CAP: { switchPosition: position } }), 1000, 4000);
    expect(cut(4)).toBeLessThan(cut(0)); // 100nF cuts more than 3.3nF
    expect(cut(5)).toBeGreaterThan(cut(0)); // the empty detent cuts least of all
  });
});

describe("온보드 액티브", () => {
  it("자이레이터가 같은 값의 실제 인덕터와 같은 노치를 만든다", () => {
    const real = deepestNotch(sweepPoints("wiring-mid-cut-inductor"));
    const gyrator = deepestNotch(sweepPoints("wiring-mid-cut-gyrator"));
    // L = R1 * R2 * Cg is the whole claim behind replacing a bulky audio inductor with an op-amp.
    expect(gyrator.hz).toBeGreaterThan(real.hz * 0.95);
    expect(gyrator.hz).toBeLessThan(real.hz * 1.05);
    expect(Math.abs(gyrator.db - real.db)).toBeLessThan(2);
  });

  it("2밴드 EQ는 노브 중앙에서 평탄하고 각 밴드가 서로를 건드리지 않는다", () => {
    const low = (ov: Record<string, Record<string, number>>) => bandDb(sweepPoints("wiring-active-2band-eq", ov), 50, 150);
    const high = (ov: Record<string, Record<string, number>>) => bandDb(sweepPoints("wiring-active-2band-eq", ov), 5000, 15000);

    expect(Math.abs(low({}))).toBeLessThan(0.5);
    expect(Math.abs(high({}))).toBeLessThan(0.5);

    // Bass knob moves the lows a lot and leaves the highs where they were.
    expect(low({ BASS: { position: 1 } })).toBeGreaterThan(12);
    expect(low({ BASS: { position: 0 } })).toBeLessThan(-12);
    expect(Math.abs(high({ BASS: { position: 1 } }))).toBeLessThan(2);

    // ...and the treble knob does the mirror image.
    expect(high({ TREBLE: { position: 1 } })).toBeGreaterThan(12);
    expect(high({ TREBLE: { position: 0 } })).toBeLessThan(-12);
    expect(Math.abs(low({ TREBLE: { position: 1 } }))).toBeLessThan(2);
  });

  it("액티브 픽업은 긴 케이블에도 응답이 평탄하지만 패시브는 크게 무너진다", () => {
    const tilt = (id: string) => bandDb(sweepPoints(id), 5000, 15000) - bandDb(sweepPoints(id), 200, 500);
    // Same 900pF cable and 1M load on both - only the pickup's output impedance differs.
    expect(Math.abs(tilt("wiring-active-pickup-long-cable"))).toBeLessThan(3);
    expect(tilt("wiring-passive-pickup-long-cable")).toBeLessThan(-15);
  });
});

describe("온보드 액티브 3밴드", () => {
  const band3 = (ov: Record<string, Record<string, number>>, lo: number, hi: number) =>
    bandDb(sweepPoints("wiring-active-3band-eq", ov), lo, hi);

  it("모든 노브 중앙에서 평탄하다", () => {
    expect(Math.abs(band3({}, 50, 150))).toBeLessThan(1.5);
    expect(Math.abs(band3({}, 350, 700))).toBeLessThan(1.5);
    expect(Math.abs(band3({}, 5000, 15000))).toBeLessThan(1.5);
  });

  it("미드 노브는 중역만 깎고 베이스/트레블은 건드리지 않는다", () => {
    const cut = { MID: { position: 0 } };
    expect(band3(cut, 350, 700)).toBeLessThan(-12);
    // The mid section is cascaded after the Baxandall stage, so it must not drag the other bands.
    expect(Math.abs(band3(cut, 50, 150))).toBeLessThan(3);
    expect(Math.abs(band3(cut, 5000, 15000))).toBeLessThan(3);
  });

  it("베이스와 트레블은 3밴드에서도 서로 독립적으로 움직인다", () => {
    expect(band3({ BASS: { position: 1 } }, 50, 150)).toBeGreaterThan(12);
    expect(Math.abs(band3({ BASS: { position: 1 } }, 5000, 15000))).toBeLessThan(2);
    expect(band3({ TREBLE: { position: 1 } }, 5000, 15000)).toBeGreaterThan(12);
    expect(Math.abs(band3({ TREBLE: { position: 1 } }, 50, 150))).toBeLessThan(2);
  });
});

describe("기타 → 페달 로딩 상호작용 (Phase 13)", () => {
  const tilt = (id: string, ov: Record<string, Record<string, number>> = {}) =>
    bandDb(sweepPoints(id, ov), 3000, 10000) - bandDb(sweepPoints(id, ov), 200, 500);

  it("저임피던스 입력에 직결하면 픽업이 로딩돼 버퍼를 거칠 때보다 훨씬 어두워진다", () => {
    // Same guitar, same pedal stage - the only difference is whether a buffer sits between them.
    expect(tilt("wiring-guitar-into-fuzz-input")).toBeLessThan(tilt("wiring-guitar-into-buffered-input") - 10);
  });

  it("직결일 때 볼륨 노브가 음량뿐 아니라 톤까지 바꾼다", () => {
    const rolled = { VOL: { position: 0.4 } };
    const directSwing = Math.abs(tilt("wiring-guitar-into-fuzz-input", rolled) - tilt("wiring-guitar-into-fuzz-input"));
    const bufferedSwing = Math.abs(tilt("wiring-guitar-into-buffered-input", rolled) - tilt("wiring-guitar-into-buffered-input"));
    // This is the "fuzz cleans up with the volume knob" effect, and the buffer is what removes it.
    expect(directSwing).toBeGreaterThan(bufferedSwing * 2);
  });
});
