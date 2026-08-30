import type { PedalPreset } from "../../types";
import { SILICON_DIODE_1N4148 } from "../../deviceModels";

/**
 * "RAT-style" inverting op-amp distortion: the defining structural difference from this app's
 * opampDrivePreset/ts9OverdrivePreset is WHERE the clipping diodes sit - here the feedback loop
 * (Rf) taps directly off the op-amp's own output ("opout", so that node stays perfectly clean and
 * linear under an ideal op-amp model - a diode shunt hung directly on a zero-impedance node
 * wouldn't clip anything, since the feedback loop would just supply whatever current the diodes
 * demand), and a series resistor (Rs) feeds a SEPARATE downstream node ("out") where the diode
 * pair actually clips - current-limited by Rs, the same pattern as diodeClipperPreset. That moves
 * the effective clipping outside the feedback loop, giving a harder/more asymmetric-feeling clip
 * character than feedback-loop clipping at the same gain. See docs/plan-circuit-archive.md for
 * sourcing notes - this is a representative reconstruction of the general topology, not a trace of
 * any specific commercial pedal's exact schematic.
 */
export const ratStyleDistortionPreset: PedalPreset = {
  id: "rat-style-distortion",
  name: "RAT 스타일 디스토션 (출력단 션트 클리핑)",
  description: "인버팅 op-amp 게인 스테이지 + 저항으로 전류 제한된 출력단 다이오드 클리퍼 - 피드백 루프 밖에서 클리핑",
  category: "디스토션",
  inputSourceId: "V1",
  tapNodes: ["in", "opout", "out"],
  outputNode: "out",
  defaultParams: {
    inputResistance: 1_000,
    feedbackResistance: 47_000,
    seriesResistance: 1_000,
  },
  archive: {
    sourceRefs: [
      { label: "ElectroSmash - circuit analysis articles (topology reference, not copied)", url: "https://www.electrosmash.com/" },
      { label: "General Guitar Gadgets - DIY stompbox schematics", url: "https://generalguitargadgets.com/" },
    ],
    disclaimer: "대표값 근사치이며 특정 상용 제품의 실측 회로도가 아닙니다.",
  },
  build: (params) => ({
    elements: [
      { id: "V1", type: "vsource", nodes: ["in", "0"], voltage: 0 },
      { id: "Rin", type: "resistor", nodes: ["in", "vminus"], resistance: params.inputResistance },
      { id: "Rf", type: "resistor", nodes: ["vminus", "opout"], resistance: params.feedbackResistance },
      { id: "U1", type: "opamp", nodes: ["0", "vminus", "opout"], openLoopGain: 1e5 },
      { id: "Rs", type: "resistor", nodes: ["opout", "out"], resistance: params.seriesResistance },
      { id: "D1", type: "diode", nodes: ["out", "0"], ...SILICON_DIODE_1N4148 },
      { id: "D2", type: "diode", nodes: ["0", "out"], ...SILICON_DIODE_1N4148 },
    ],
  }),
};
