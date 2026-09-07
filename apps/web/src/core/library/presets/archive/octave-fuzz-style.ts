import type { PedalPreset } from "../../types";
import { GENERIC_SILICON_NPN, GERMANIUM_DIODE } from "../../deviceModels";

/**
 * Transformer octave fuzz, in the Octavia style.
 *
 * The octave comes from a centre-tapped transformer feeding two diodes pointing opposite ways: each
 * half of the winding rectifies one polarity of the signal, and summing them produces one output
 * cycle per half cycle of the input - a full-wave rectifier used as a musical device rather than as
 * a power supply. Doubling the rate is what makes it sing an octave up, and the fact that
 * rectification is nothing like a sine is what makes it sound the way it does.
 *
 * This is the first preset that needs real magnetic coupling: a transformer cannot be faked with two
 * independent inductors, because the whole effect lives in the mutual term (see
 * core/components/coupledInductors.ts). See docs/plan-circuit-archive.md for sourcing notes.
 */
export const octaveFuzzStylePreset: PedalPreset = {
  id: "octave-fuzz-style",
  name: "옥타브 퍼즈 (트랜스포머 전파 정류, Octavia 스타일)",
  description: "게인 단 + 트랜스포머 + 역방향 다이오드 쌍으로 전파 정류해 한 옥타브 위를 만드는 퍼즈",
  category: "퍼즈",
  inputSourceId: "V1",
  tapNodes: ["in", "coll", "secA", "secB", "out"],
  outputNode: "out",
  defaultParams: {
    collectorResistance: 10_000,
    /** How tightly the windings share flux. Loosening it bleeds the octave away. */
    coupling: 0.95,
  },
  variants: [
    { id: "tight", label: "강한 결합 (k=0.95)", params: { coupling: 0.95 } },
    { id: "loose", label: "느슨한 결합 (k=0.4)", params: { coupling: 0.4 } },
  ],
  archive: {
    sourceRefs: [
      { label: "electrosmash.com / DIY 커뮤니티의 공개된 옥타브 퍼즈 토폴로지 분석 (복제 아님)", url: "https://www.electrosmash.com/" },
    ],
    disclaimer: "대표값 근사치이며 특정 상용 제품의 실측 회로도가 아닙니다.",
  },
  build: (params) => ({
    elements: [
      { id: "V1", type: "vsource", nodes: ["in", "0"], voltage: 0 },
      { id: "Vcc", type: "vsource", nodes: ["vcc", "0"], voltage: 9 },

      { id: "Cin", type: "capacitor", nodes: ["in", "base"], capacitance: 0.1e-6 },
      { id: "Rb1", type: "resistor", nodes: ["vcc", "base"], resistance: 470_000 },
      { id: "Rb2", type: "resistor", nodes: ["base", "0"], resistance: 47_000 },
      { id: "Q1", type: "bjt", nodes: ["base", "coll", "emit"], polarity: "npn", ...GENERIC_SILICON_NPN },
      { id: "Rc", type: "resistor", nodes: ["vcc", "coll"], resistance: params.collectorResistance },
      { id: "Re", type: "resistor", nodes: ["emit", "0"], resistance: 1_000 },
      { id: "Ce", type: "capacitor", nodes: ["emit", "0"], capacitance: 47e-6 },

      // Primary across the collector; the secondary's centre tap is grounded so the two halves
      // present opposite polarities to the diode pair.
      { id: "Cpri", type: "capacitor", nodes: ["coll", "pri"], capacitance: 0.1e-6 },
      // A centre-tapped secondary is two windings sharing one primary, so it is built as two
      // coupled pairs on the same primary nodes with the tap end wired to ground. The second
      // winding is entered ends-reversed, which is what puts the two halves in antiphase.
      { id: "T1", type: "coupledInductors", nodes: ["pri", "0", "secA", "0"], inductanceA: 1, inductanceB: 1, coupling: params.coupling },
      { id: "T2", type: "coupledInductors", nodes: ["pri", "0", "0", "secB"], inductanceA: 1, inductanceB: 1, coupling: params.coupling },

      // Full-wave rectifier: each winding half passes one polarity, and summing them gives one
      // output cycle per half cycle of the input. Germanium for the soft, leaky knee.
      { id: "D1", type: "diode", nodes: ["secA", "out"], ...GERMANIUM_DIODE },
      { id: "D2", type: "diode", nodes: ["secB", "out"], ...GERMANIUM_DIODE },
      { id: "Rout", type: "resistor", nodes: ["out", "0"], resistance: 100_000 },
      { id: "Rload", type: "resistor", nodes: ["out", "0"], resistance: 1_000_000 },
    ],
  }),
};
