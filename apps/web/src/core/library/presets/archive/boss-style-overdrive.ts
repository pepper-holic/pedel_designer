import type { PedalPreset } from "../../types";
import { SILICON_DIODE_1N4148 } from "../../deviceModels";

const POT_TOTAL = 100_000;
const MIN_SERIES = 50;

/**
 * "Boss-style" overdrive: an inverting op-amp clipping stage (same feedback-diode pattern as
 * opampDrivePreset) followed by a passive shunt tone control and a unity output buffer - three
 * stages in series, the defining feature being that tone shaping happens AFTER clipping rather
 * than being folded into the gain stage's own feedback network (contrast activeShelfEqPreset,
 * which shapes tone via the gain stage's input impedance with no separate clipping stage at all).
 * See docs/plan-circuit-archive.md for sourcing notes - this is a representative reconstruction
 * of the general topology, not a trace of any specific commercial pedal's exact schematic.
 */
export const bossStyleOverdrivePreset: PedalPreset = {
  id: "boss-style-overdrive",
  name: "오버드라이브 (클리핑 + 톤 통합형, Boss 스타일)",
  description: "인버팅 op-amp 클리핑 게인 스테이지 + 패시브 톤 컨트롤 + 출력 버퍼 - 클리핑 이후 톤을 다듬는 다단 구성",
  category: "오버드라이브",
  inputSourceId: "V1",
  tapNodes: ["in", "stage1out", "tone", "out"],
  outputNode: "out",
  defaultParams: {
    inputResistance: 10_000,
    feedbackResistance: 200_000,
    tone: 0.5, // 0 = darkest, 1 = brightest
    toneCapacitance: 4.7e-9,
  },
  archive: {
    sourceRefs: [
      { label: "ElectroSmash - circuit analysis articles (topology reference, not copied)", url: "https://www.electrosmash.com/" },
      { label: "General Guitar Gadgets - DIY stompbox schematics", url: "https://generalguitargadgets.com/" },
    ],
    disclaimer: "대표값 근사치이며 특정 상용 제품의 실측 회로도가 아닙니다.",
  },
  layout: {
    V1: { x: 60, y: 250 },
    Rin: { x: 200, y: 250 },
    U1: { x: 340, y: 250 },
    Rf: { x: 280, y: 100 },
    D1a: { x: 280, y: 400 },
    D1b: { x: 340, y: 400 },
    Rtone: { x: 480, y: 250 },
    Ctone: { x: 550, y: 400 },
    Ubuf: { x: 690, y: 250 },
  },
  // Functional decomposition (docs/plan-core-fundamentals.md B-5): loads as labelled blocks that can be
  // collapsed into black boxes; knobs load as real potentiometers.
  blocks: [
    { id: "drive", label: "드라이브 단 (피드백 다이오드)", category: "clipping", elements: ["Rin", "Rf", "D1a", "D1b", "U1"], ports: [{ kind: "in", node: "in" }, { kind: "out", node: "stage1out" }] },
    { id: "tone", label: "톤", category: "tone", elements: ["Rtone", "Ctone"], ports: [{ kind: "in", node: "stage1out" }, { kind: "out", node: "tone" }] },
    { id: "buffer", label: "출력 버퍼", category: "buffer", elements: ["Ubuf"], ports: [{ kind: "in", node: "tone" }, { kind: "out", node: "out" }] },
  ],
  knobs: [
    { kind: "rheostat", id: "DRIVE", label: "DRIVE", element: "Rf", maxResistance: 400_000, taper: "B" },
    { kind: "rheostat", id: "TONE", label: "TONE", element: "Rtone", maxResistance: 100_000, taper: "B", reverse: true },
  ],
  build: (params) => {
    const seriesResistance = Math.max(POT_TOTAL * (1 - params.tone), MIN_SERIES);
    return {
      elements: [
        { id: "V1", type: "vsource", nodes: ["in", "0"], voltage: 0 },

        { id: "Rin", type: "resistor", nodes: ["in", "vminus"], resistance: params.inputResistance },
        { id: "Rf", type: "resistor", nodes: ["vminus", "stage1out"], resistance: params.feedbackResistance },
        { id: "D1a", type: "diode", nodes: ["vminus", "stage1out"], ...SILICON_DIODE_1N4148 },
        { id: "D1b", type: "diode", nodes: ["stage1out", "vminus"], ...SILICON_DIODE_1N4148 },
        { id: "U1", type: "opamp", nodes: ["0", "vminus", "stage1out"], openLoopGain: 1e5 },

        { id: "Rtone", type: "resistor", nodes: ["stage1out", "tone"], resistance: seriesResistance },
        { id: "Ctone", type: "capacitor", nodes: ["tone", "0"], capacitance: params.toneCapacitance },

        { id: "Ubuf", type: "opamp", nodes: ["tone", "out", "out"], openLoopGain: 1e5 },
      ],
    };
  },
};
