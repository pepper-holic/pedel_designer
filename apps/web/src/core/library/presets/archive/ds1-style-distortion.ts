import type { PedalPreset } from "../../types";
import { SILICON_DIODE_1N4148, GENERIC_SILICON_NPN } from "../../deviceModels";

const TONE_POT = 20_000;
const MIN_SERIES = 50;

/**
 * DS-1-style distortion: the one op-amp distortion in this library that puts a DISCRETE transistor
 * booster in front of the op-amp. Q2 is a common-emitter stage biased by collector-to-base feedback
 * (470k) with an almost bare 22R emitter, so it alone contributes ~35-40dB before the non-inverting
 * op-amp stage (gain 1 + DIST/4.7k, up to ~27dB) adds its share - the two together are why this
 * family clips hard at a whisper of input. Clipping is a current-limited silicon shunt pair after the
 * op-amp (same pattern as rat-style-distortion), and the tone is a Big-Muff-style blend: a low-pass
 * leg (6.8k/0.1u) and a high-pass leg (0.022u/6.8k) with the pot wiper between them, giving the
 * characteristic mid scoop. See docs/plan-circuit-archive.md for sourcing notes.
 */
export const ds1StyleDistortionPreset: PedalPreset = {
  id: "ds1-style-distortion",
  name: "디스토션 (트랜지스터 부스터 + op-amp, DS-1 스타일)",
  description: "컬렉터 피드백 바이어스 NPN 부스터 → 논인버팅 op-amp 게인 → 출력단 실리콘 션트 클리핑 → 저역/고역 두 갈래를 섞는 톤",
  category: "디스토션",
  inputSourceId: "V1",
  tapNodes: ["in", "q2coll", "opout", "clip", "out"],
  outputNode: "out",
  defaultParams: {
    distortionResistance: 47_000,
    tone: 0.5, // 0 = low-pass leg only (dark), 1 = high-pass leg only (bright)
  },
  archive: {
    sourceRefs: [
      { label: "ElectroSmash - Boss DS-1 analysis (topology/values reference, not copied)", url: "https://www.electrosmash.com/boss-ds1-analysis" },
    ],
    disclaimer: "대표값 근사치이며 특정 상용 제품의 실측 회로도가 아닙니다.",
  },
  // Functional decomposition (docs/plan-core-fundamentals.md B-5): loads as labelled blocks that can be
  // collapsed into black boxes; knobs load as real potentiometers.
  blocks: [
    { id: "power", label: "전원 (9V)", category: "power", elements: ["Vcc", "Vdd"], ports: [{ kind: "supply", node: "vcc", label: "9V" }] },
    { id: "booster", label: "트랜지스터 부스터", category: "gain", elements: ["Cin", "Rfb", "Q2", "Rc", "Re"], ports: [{ kind: "in", node: "in" }, { kind: "out", node: "q2coll" }, { kind: "supply", node: "vcc", label: "V+" }] },
    { id: "gain", label: "op-amp 게인 (논인버팅)", category: "gain", elements: ["Ccpl", "Rbias", "U1", "Rg", "Cg", "Rf"], ports: [{ kind: "in", node: "q2coll" }, { kind: "out", node: "opout" }] },
    { id: "clip", label: "하드 클리핑 (실리콘 션트)", category: "clipping", elements: ["Rs", "D1", "D2", "Cclip"], ports: [{ kind: "in", node: "opout" }, { kind: "out", node: "clip" }] },
    { id: "tone", label: "톤 (저역/고역 블렌드)", category: "tone", elements: ["Rlp", "Clp", "Chp", "Rhp", "Rtone1", "Rtone2"], ports: [{ kind: "in", node: "clip" }, { kind: "out", node: "out" }] },
    { id: "output", label: "출력 (레벨)", category: "output", elements: ["Rload"], ports: [{ kind: "in", node: "out" }, { kind: "out", node: "out" }] },
  ],
  knobs: [
    { kind: "rheostat", id: "DIST", label: "DIST", element: "Rf", maxResistance: 100_000, taper: "B" },
    { kind: "pot", id: "TONE", label: "TONE", upper: "Rtone1", lower: "Rtone2", taper: "B" },
  ],
  build: (params) => ({
    elements: [
      { id: "V1", type: "vsource", nodes: ["in", "0"], voltage: 0 },
      { id: "Vcc", type: "vsource", nodes: ["vcc", "0"], voltage: 9, role: "supply" },

      // Q2 booster: collector-feedback bias (Rfb from collector to base), 10k collector load and a
      // nearly bare 22R emitter - the gain is set by the device's own 1/gm rather than by Rc/Re.
      { id: "Cin", type: "capacitor", nodes: ["in", "q2base"], capacitance: 0.47e-6 },
      { id: "Rfb", type: "resistor", nodes: ["q2coll", "q2base"], resistance: 470_000 },
      { id: "Q2", type: "bjt", nodes: ["q2base", "q2coll", "q2emit"], polarity: "npn", ...GENERIC_SILICON_NPN },
      { id: "Rc", type: "resistor", nodes: ["vcc", "q2coll"], resistance: 10_000 },
      { id: "Re", type: "resistor", nodes: ["q2emit", "0"], resistance: 22 },

      // Non-inverting op-amp stage: gain = 1 + Rf/Rg at audio, unity at DC thanks to Cg.
      { id: "Ccpl", type: "capacitor", nodes: ["q2coll", "vplus"], capacitance: 68e-9 },
      { id: "Rbias", type: "resistor", nodes: ["vplus", "0"], resistance: 100_000 },
      { id: "U1", type: "opamp", nodes: ["vplus", "vminus", "opout"], openLoopGain: 1e5 },
      { id: "Rg", type: "resistor", nodes: ["vminus", "gleg"], resistance: 4_700 },
      { id: "Cg", type: "capacitor", nodes: ["gleg", "0"], capacitance: 0.47e-6 },
      { id: "Rf", type: "resistor", nodes: ["vminus", "opout"], resistance: params.distortionResistance },

      // Shunt clipper after the op-amp, current-limited by Rs so the ideal op-amp output stays clean.
      { id: "Rs", type: "resistor", nodes: ["opout", "clip"], resistance: 2_200 },
      { id: "D1", type: "diode", nodes: ["clip", "0"], ...SILICON_DIODE_1N4148 },
      { id: "D2", type: "diode", nodes: ["0", "clip"], ...SILICON_DIODE_1N4148 },
      { id: "Cclip", type: "capacitor", nodes: ["clip", "0"], capacitance: 0.01e-6 },

      // Big-Muff-style tone: low-pass leg and high-pass leg, pot wiper blends between them.
      { id: "Rlp", type: "resistor", nodes: ["clip", "lp"], resistance: 6_800 },
      { id: "Clp", type: "capacitor", nodes: ["lp", "0"], capacitance: 0.1e-6 },
      { id: "Chp", type: "capacitor", nodes: ["clip", "hp"], capacitance: 0.022e-6 },
      { id: "Rhp", type: "resistor", nodes: ["hp", "0"], resistance: 6_800 },
      { id: "Rtone1", type: "resistor", nodes: ["lp", "out"], resistance: Math.max(TONE_POT * params.tone, MIN_SERIES) },
      { id: "Rtone2", type: "resistor", nodes: ["out", "hp"], resistance: Math.max(TONE_POT * (1 - params.tone), MIN_SERIES) },

      // Stands in for the level pot.
      { id: "Rload", type: "resistor", nodes: ["out", "0"], resistance: 100_000 },
    ],
  }),
};
