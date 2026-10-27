import { describe, expect, it } from "vitest";
import { RealtimeEngine, resampleLinear } from "../../src/audio/realtime/realtimeEngine";
import { ts9OverdrivePreset } from "../../src/core/library/presets/ts9-overdrive";
import type { Netlist } from "../../src/core/solver/types";

const RATE = 48000;
const QUANTUM = 128;

function rcLowPass(resistance = 1000): Netlist {
  return {
    elements: [
      { id: "V1", type: "vsource", nodes: ["in", "0"], voltage: 0 },
      { id: "R1", type: "resistor", nodes: ["in", "out"], resistance },
      { id: "C1", type: "capacitor", nodes: ["out", "0"], capacitance: 100e-9 },
    ],
  };
}

function sine(hz: number, seconds: number, amplitude = 0.5): Float32Array {
  const out = new Float32Array(Math.round(seconds * RATE));
  for (let i = 0; i < out.length; i++) out[i] = amplitude * Math.sin((2 * Math.PI * hz * i) / RATE);
  return out;
}

/** Renders `seconds` of audio and returns it as one buffer. */
function renderSeconds(engine: RealtimeEngine, seconds: number): Float32Array {
  const blocks = Math.ceil((seconds * RATE) / QUANTUM);
  const all = new Float32Array(blocks * QUANTUM);
  const block = new Float32Array(QUANTUM);
  for (let b = 0; b < blocks; b++) {
    engine.render(block);
    all.set(block, b * QUANTUM);
  }
  return all;
}

const peak = (data: Float32Array, from = 0, to = data.length) => {
  let p = 0;
  for (let i = from; i < to; i++) p = Math.max(p, Math.abs(data[i]));
  return p;
};

describe("RealtimeEngine", () => {
  it("is silent until started", () => {
    const engine = new RealtimeEngine(RATE, () => 0);
    const out = renderSeconds(engine, 0.01);
    expect(peak(out)).toBe(0);
    expect(engine.playing).toBe(false);
  });

  it("mutes the warm-up, then plays the circuit at a normalised, bounded level", () => {
    const engine = new RealtimeEngine(RATE, () => 0);
    engine.handle({ type: "start", netlist: rcLowPass(), inputSourceId: "V1", outputNode: "out", input: sine(220, 0.5), inputGain: 1 });
    const out = renderSeconds(engine, 2);
    expect(peak(out, 0, Math.round(0.29 * RATE))).toBe(0);
    const tail = peak(out, Math.round(1.5 * RATE));
    // Auto gain steers towards 0.5; tanh keeps everything inside [-1, 1].
    expect(tail).toBeGreaterThan(0.3);
    expect(tail).toBeLessThan(0.8);
    expect(peak(out)).toBeLessThanOrEqual(1);
  });

  it("reports load and level a few times a second", () => {
    let clock = 0;
    const engine = new RealtimeEngine(RATE, () => (clock += 0.5));
    engine.handle({ type: "start", netlist: rcLowPass(), inputSourceId: "V1", outputNode: "out", input: sine(220, 0.5), inputGain: 1 });
    renderSeconds(engine, 1);
    const messages = engine.drain();
    const stats = messages.filter((m) => m.type === "stats");
    expect(stats.length).toBeGreaterThanOrEqual(3);
    for (const s of stats) {
      if (s.type !== "stats") continue;
      // 0.5ms per 128-sample block (2.67ms of audio) -> load ~0.19.
      expect(s.load).toBeCloseTo(0.5 / ((QUANTUM / RATE) * 1000), 2);
      expect(s.nonConvergent).toBe(0);
    }
    expect(engine.drain()).toEqual([]);
  });

  it("takes a changed value without restarting from rest", () => {
    const engine = new RealtimeEngine(RATE, () => 0);
    engine.handle({ type: "start", netlist: rcLowPass(1000), inputSourceId: "V1", outputNode: "out", input: sine(220, 0.5), inputGain: 1 });
    renderSeconds(engine, 1);
    engine.handle({ type: "netlist", netlist: rcLowPass(10000) });
    const after = renderSeconds(engine, 0.05);
    // No second muted warm-up: sound continues straight away.
    expect(peak(after)).toBeGreaterThan(0.2);
  });

  it("goes quiet on stop", () => {
    const engine = new RealtimeEngine(RATE, () => 0);
    engine.handle({ type: "start", netlist: rcLowPass(), inputSourceId: "V1", outputNode: "out", input: sine(220, 0.5), inputGain: 1 });
    renderSeconds(engine, 0.5);
    engine.handle({ type: "stop" });
    expect(peak(renderSeconds(engine, 0.01))).toBe(0);
  });

  it("reports a circuit it cannot play instead of throwing inside the audio thread", () => {
    const engine = new RealtimeEngine(RATE, () => 0);
    engine.handle({ type: "start", netlist: rcLowPass(), inputSourceId: "NOPE", outputNode: "out", input: sine(220, 0.1), inputGain: 1 });
    expect(engine.playing).toBe(false);
    const [message] = engine.drain();
    expect(message.type).toBe("error");
  });

  it("plays a real overdrive preset", () => {
    const netlist = ts9OverdrivePreset.build(ts9OverdrivePreset.defaultParams);
    const engine = new RealtimeEngine(RATE, () => 0);
    engine.handle({
      type: "start",
      netlist,
      inputSourceId: ts9OverdrivePreset.inputSourceId,
      outputNode: ts9OverdrivePreset.outputNode,
      input: sine(196, 0.25, 0.3),
      inputGain: 1,
    });
    const out = renderSeconds(engine, 1.2);
    expect(peak(out, Math.round(0.8 * RATE))).toBeGreaterThan(0.2);
    expect(out.every(Number.isFinite)).toBe(true);
  });
});

describe("resampleLinear", () => {
  it("keeps the duration and interpolates between samples", () => {
    const out = resampleLinear([0, 1, 2, 3], 2, 4);
    expect(out.length).toBe(8);
    expect(out[1]).toBeCloseTo(0.5);
    expect(out[2]).toBeCloseTo(1);
  });

  it("copies when the rates match and handles empty input", () => {
    expect(Array.from(resampleLinear([1, 2], 48000, 48000))).toEqual([1, 2]);
    expect(resampleLinear([], 44100, 48000).length).toBe(0);
  });
});
