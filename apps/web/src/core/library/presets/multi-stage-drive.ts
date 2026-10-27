import type { PedalPreset } from "../types";
import { SILICON_DIODE_1N4148 } from "../deviceModels";

/** Two cascaded inverting op-amp clipping stages: each one soft-clips before handing off to the next for higher gain / more compression. */
export const multiStageDrivePreset: PedalPreset = {
  id: "multi-stage-drive",
  name: "다단 증폭 드라이브 (2단 Op-Amp 클리핑)",
  description: "동일한 op-amp 클리핑 스테이지 2개를 직렬로 연결 - 게인과 압축감 증가",
  category: "오버드라이브",
  inputSourceId: "V1",
  tapNodes: ["in", "stage1", "out"],
  outputNode: "out",
  defaultParams: {
    inputResistance: 10_000,
    feedbackResistance: 100_000,
  },
  // Functional decomposition (docs/plan-core-fundamentals.md B-5): loads as labelled blocks that can be
  // collapsed into black boxes; knobs load as real potentiometers.
  blocks: [
    { id: "stage1", label: "1단 드라이브", category: "clipping", elements: ["Rin1", "Rf1", "D1a", "D1b", "U1"], ports: [{ kind: "in", node: "in" }, { kind: "out", node: "stage1" }] },
    { id: "stage2", label: "2단 드라이브", category: "clipping", elements: ["Rin2", "Rf2", "D2a", "D2b", "U2"], ports: [{ kind: "in", node: "stage1" }, { kind: "out", node: "out" }] },
  ],
  knobs: [
    { kind: "rheostat", id: "GAIN1", label: "GAIN 1", element: "Rf1", maxResistance: 200_000, taper: "B" },
    { kind: "rheostat", id: "GAIN2", label: "GAIN 2", element: "Rf2", maxResistance: 200_000, taper: "B" },
  ],
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
