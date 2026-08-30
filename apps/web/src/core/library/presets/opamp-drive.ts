import type { PedalPreset } from "../types";
import { SILICON_DIODE_1N4148 } from "../deviceModels";

/**
 * Tube-Screamer-style inverting op-amp gain stage with an antiparallel diode
 * pair across the feedback resistor: linear gain -Rf/Rin at low level, soft
 * clipping once the feedback loop tries to exceed the diode drop.
 */
export const opampDrivePreset: PedalPreset = {
  id: "opamp-drive",
  name: "오버드라이브 (Op-Amp 피드백 클리핑)",
  description: "인버팅 연산증폭기 게인 스테이지 + 피드백 다이오드 - 소프트 클리핑",
  category: "오버드라이브",
  inputSourceId: "V1",
  tapNodes: ["in", "vminus", "out"],
  outputNode: "out",
  defaultParams: {
    inputResistance: 10_000,
    feedbackResistance: 500_000,
  },
  build: (params) => ({
    elements: [
      { id: "V1", type: "vsource", nodes: ["in", "0"], voltage: 0 },
      { id: "Rin", type: "resistor", nodes: ["in", "vminus"], resistance: params.inputResistance },
      { id: "Rf", type: "resistor", nodes: ["vminus", "out"], resistance: params.feedbackResistance },
      { id: "D1", type: "diode", nodes: ["vminus", "out"], ...SILICON_DIODE_1N4148 },
      { id: "D2", type: "diode", nodes: ["out", "vminus"], ...SILICON_DIODE_1N4148 },
      { id: "U1", type: "opamp", nodes: ["0", "vminus", "out"], openLoopGain: 1e5 },
    ],
  }),
};
