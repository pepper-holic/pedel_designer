import type { PedalPreset } from "../types";
import { SILICON_DIODE_1N4148, RED_LED } from "../deviceModels";

/** Silicon diode one way, LED the other: clips harder/earlier on one half-cycle than the other, adding even harmonics. */
export const asymmetricClipperPreset: PedalPreset = {
  id: "asymmetric-clipper",
  name: "다이오드 클리퍼 (비대칭: 실리콘 + LED)",
  description: "저항 + 비대칭 다이오드 페어(실리콘/LED) - 짝수 배음이 강한 비대칭 클리핑",
  inputSourceId: "V1",
  tapNodes: ["in", "out"],
  outputNode: "out",
  defaultParams: {
    seriesResistance: 10_000,
  },
  build: (params) => ({
    elements: [
      { id: "V1", type: "vsource", nodes: ["in", "0"], voltage: 0 },
      { id: "R1", type: "resistor", nodes: ["in", "out"], resistance: params.seriesResistance },
      { id: "D1", type: "diode", nodes: ["out", "0"], ...SILICON_DIODE_1N4148 },
      { id: "D2", type: "diode", nodes: ["0", "out"], ...RED_LED },
    ],
  }),
};
