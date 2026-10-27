import type { PedalPreset } from "../../types";
import { SILICON_DIODE_1N4148, GENERIC_SILICON_NPN } from "../../deviceModels";

const POT_TOTAL = 100_000;
const MIN_SERIES = 50;

/**
 * "Big Muff-style" fuzz: two silicon-NPN common-emitter clipping stages (each with an antiparallel
 * diode pair shunting its own collector node to ground, RC-coupled to the next stage - the hallmark
 * that separates this from fuzzGermaniumPreset's single direct-coupled PNP feedback loop), followed
 * by a passive tone control before the output. Each stage clips independently rather than sharing one
 * global feedback loop, giving a harder/more compressed, buzzier character with the scoop-tone knob
 * shaping what gets through afterward. See docs/plan-circuit-archive.md for sourcing notes - this is
 * a representative reconstruction of the general topology, not a trace of any specific commercial
 * pedal's exact schematic.
 */
export const bigMuffStyleFuzzPreset: PedalPreset = {
  id: "big-muff-style-fuzz",
  name: "퍼즈 (2단 실리콘 클리핑 + 톤스택, Big Muff 스타일)",
  description: "실리콘 트랜지스터 2단 컬렉터 클리핑 + 패시브 톤스택 - 압축감 강한 버즈 퍼즈",
  category: "퍼즈",
  inputSourceId: "V1",
  tapNodes: ["in", "c1", "c2", "outAC"],
  outputNode: "outAC",
  defaultParams: {
    collectorResistance: 10_000,
    emitterResistance: 470,
    baseBiasResistance: 1_800_000,
    tone: 0.5, // 0 = darkest, 1 = brightest (same convention as passiveToneTiltPreset)
    toneCapacitance: 4.7e-9,
  },
  archive: {
    sourceRefs: [
      { label: "ElectroSmash - circuit analysis articles (topology reference, not copied)", url: "https://www.electrosmash.com/" },
      { label: "Tagboard Effects - DIY layout archive (topology reference, not copied)", url: "https://tagboardeffects.blogspot.com/" },
    ],
    disclaimer: "대표값 근사치이며 특정 상용 제품의 실측 회로도가 아닙니다.",
  },
  layout: {
    V1: { x: 60, y: 300 },
    Cin: { x: 200, y: 300 },
    Rb1: { x: 340, y: 120 },
    Q1: { x: 340, y: 300 },
    Rc1: { x: 340, y: 40 },
    Re1: { x: 340, y: 460 },
    Ce1: { x: 400, y: 460 },
    D1a: { x: 460, y: 120 },
    D1b: { x: 460, y: 200 },
    C1: { x: 550, y: 300 },
    Rb2: { x: 690, y: 120 },
    Q2: { x: 690, y: 300 },
    Rc2: { x: 690, y: 40 },
    Re2: { x: 690, y: 460 },
    Ce2: { x: 750, y: 460 },
    D2a: { x: 810, y: 120 },
    D2b: { x: 810, y: 200 },
    Rtone: { x: 900, y: 300 },
    Ctone: { x: 960, y: 460 },
    Cout: { x: 1040, y: 300 },
    Rload: { x: 1120, y: 300 },
    Vcc: { x: 60, y: 40 },
  },
  // Functional decomposition (docs/plan-core-fundamentals.md B-5): loads as labelled blocks that can be
  // collapsed into black boxes; knobs load as real potentiometers.
  blocks: [
    { id: "power", label: "전원 (9V)", category: "power", elements: ["Vcc", "Vdd"], ports: [{ kind: "supply", node: "vcc", label: "9V" }] },
    { id: "stage1", label: "1단 증폭 + 클리핑", category: "fuzz", elements: ["Cin", "Rb1", "Q1", "Rc1", "Re1", "Ce1", "D1a", "D1b"], ports: [{ kind: "in", node: "in" }, { kind: "out", node: "c1" }, { kind: "supply", node: "vcc", label: "V+" }] },
    { id: "stage2", label: "2단 증폭 + 클리핑", category: "fuzz", elements: ["C1", "Rb2", "Q2", "Rc2", "Re2", "Ce2", "D2a", "D2b"], ports: [{ kind: "in", node: "c1" }, { kind: "out", node: "c2" }, { kind: "supply", node: "vcc", label: "V+" }] },
    { id: "tone", label: "톤", category: "tone", elements: ["Rtone", "Ctone"], ports: [{ kind: "in", node: "c2" }, { kind: "out", node: "tone" }] },
    { id: "output", label: "출력 커플링", category: "output", elements: ["Cout", "Rload"], ports: [{ kind: "in", node: "tone" }, { kind: "out", node: "outAC" }] },
  ],
  knobs: [
    { kind: "rheostat", id: "TONE", label: "TONE", element: "Rtone", maxResistance: 100_000, taper: "B", reverse: true },
  ],
  build: (params) => {
    const seriesResistance = Math.max(POT_TOTAL * (1 - params.tone), MIN_SERIES);
    return {
      elements: [
        { id: "V1", type: "vsource", nodes: ["in", "0"], voltage: 0 },
        { id: "Vcc", type: "vsource", nodes: ["vcc", "0"], voltage: 9 },

        { id: "Cin", type: "capacitor", nodes: ["in", "b1"], capacitance: 2.2e-6 },
        { id: "Rb1", type: "resistor", nodes: ["vcc", "b1"], resistance: params.baseBiasResistance },
        { id: "Q1", type: "bjt", nodes: ["b1", "c1", "e1"], polarity: "npn", ...GENERIC_SILICON_NPN },
        { id: "Rc1", type: "resistor", nodes: ["vcc", "c1"], resistance: params.collectorResistance },
        { id: "Re1", type: "resistor", nodes: ["e1", "0"], resistance: params.emitterResistance },
        { id: "Ce1", type: "capacitor", nodes: ["e1", "0"], capacitance: 22e-6 },
        { id: "D1a", type: "diode", nodes: ["c1", "0"], ...SILICON_DIODE_1N4148 },
        { id: "D1b", type: "diode", nodes: ["0", "c1"], ...SILICON_DIODE_1N4148 },

        { id: "C1", type: "capacitor", nodes: ["c1", "b2"], capacitance: 1e-6 },
        { id: "Rb2", type: "resistor", nodes: ["vcc", "b2"], resistance: params.baseBiasResistance },
        { id: "Q2", type: "bjt", nodes: ["b2", "c2", "e2"], polarity: "npn", ...GENERIC_SILICON_NPN },
        { id: "Rc2", type: "resistor", nodes: ["vcc", "c2"], resistance: params.collectorResistance },
        { id: "Re2", type: "resistor", nodes: ["e2", "0"], resistance: params.emitterResistance },
        { id: "Ce2", type: "capacitor", nodes: ["e2", "0"], capacitance: 22e-6 },
        { id: "D2a", type: "diode", nodes: ["c2", "0"], ...SILICON_DIODE_1N4148 },
        { id: "D2b", type: "diode", nodes: ["0", "c2"], ...SILICON_DIODE_1N4148 },

        { id: "Rtone", type: "resistor", nodes: ["c2", "tone"], resistance: seriesResistance },
        { id: "Ctone", type: "capacitor", nodes: ["tone", "0"], capacitance: params.toneCapacitance },
        { id: "Cout", type: "capacitor", nodes: ["tone", "outAC"], capacitance: 1e-6 },
        { id: "Rload", type: "resistor", nodes: ["outAC", "0"], resistance: 1_000_000 },
      ],
    };
  },
};
