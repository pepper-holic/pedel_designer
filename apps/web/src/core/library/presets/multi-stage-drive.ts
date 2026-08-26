import type { PedalPreset } from "../types";
import { SILICON_DIODE_1N4148 } from "../deviceModels";

/** Two cascaded inverting op-amp clipping stages: each one soft-clips before handing off to the next for higher gain / more compression. */
export const multiStageDrivePreset: PedalPreset = {
  id: "multi-stage-drive",
  name: "다단 증폭 드라이브 (2단 Op-Amp 클리핑)",
  description: "동일한 op-amp 클리핑 스테이지 2개를 직렬로 연결 - 게인과 압축감 증가",
  inputSourceId: "V1",
  tapNodes: ["in", "stage1", "out"],
  outputNode: "out",
  defaultParams: {
    inputResistance: 10_000,
    feedbackResistance: 100_000,
  },
  // Hand-tuned layout: two clipping stages side by side, each with its feedback diode pair
  // stacked directly above/below the feedback resistor instead of wherever the BFS auto-layout
  // (which only orders by signal-flow depth) happens to drop them.
  layout: {
    V1: { x: 60, y: 120 },
    Rin1: { x: 180, y: 120 },
    U1: { x: 300, y: 120 },
    Rf1: { x: 240, y: 40 },
    D1a: { x: 240, y: 200 },
    D1b: { x: 300, y: 200 },
    Rin2: { x: 420, y: 120 },
    U2: { x: 540, y: 120 },
    Rf2: { x: 480, y: 40 },
    D2a: { x: 480, y: 200 },
    D2b: { x: 540, y: 200 },
  },
  build: (params) => ({
    elements: [
      { id: "V1", type: "vsource", nodes: ["in", "0"], voltage: 0 },

      { id: "Rin1", type: "resistor", nodes: ["in", "vminus1"], resistance: params.inputResistance },
      { id: "Rf1", type: "resistor", nodes: ["vminus1", "stage1"], resistance: params.feedbackResistance },
      { id: "D1a", type: "diode", nodes: ["vminus1", "stage1"], ...SILICON_DIODE_1N4148 },
      { id: "D1b", type: "diode", nodes: ["stage1", "vminus1"], ...SILICON_DIODE_1N4148 },
      { id: "U1", type: "opamp", nodes: ["0", "vminus1", "stage1"], openLoopGain: 1e5 },

      { id: "Rin2", type: "resistor", nodes: ["stage1", "vminus2"], resistance: params.inputResistance },
      { id: "Rf2", type: "resistor", nodes: ["vminus2", "out"], resistance: params.feedbackResistance },
      { id: "D2a", type: "diode", nodes: ["vminus2", "out"], ...SILICON_DIODE_1N4148 },
      { id: "D2b", type: "diode", nodes: ["out", "vminus2"], ...SILICON_DIODE_1N4148 },
      { id: "U2", type: "opamp", nodes: ["0", "vminus2", "out"], openLoopGain: 1e5 },
    ],
  }),
};
