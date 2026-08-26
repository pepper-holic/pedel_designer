import type { PedalPreset } from "../types";
import { SILICON_DIODE_1N4148, JRC4558_APPROX } from "../deviceModels";

/**
 * Same inverting op-amp gain stage + feedback diode clipping as opamp-drive, but with a JRC4558
 * approximation (finite GBWP, slew rate, rail clipping) instead of an ideal op-amp - demonstrates
 * that the non-ideal macromodel audibly softens/darkens the top end versus the ideal version.
 */
export const ts9OverdrivePreset: PedalPreset = {
  id: "ts9-overdrive",
  name: "TS9 스타일 오버드라이브 (비이상적 Op-Amp)",
  description: "JRC4558 근사(GBWP~3MHz, 슬루레이트, rail 클리핑) 적용 - 이상적 opamp-drive 프리셋과 톤 비교용",
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
      { id: "U1", type: "opamp", nodes: ["0", "vminus", "out"], openLoopGain: 1e5, ...JRC4558_APPROX },
    ],
  }),
};
