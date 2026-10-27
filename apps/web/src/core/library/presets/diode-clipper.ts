import type { PedalPreset } from "../types";
import { SILICON_DIODE_1N4148 } from "../deviceModels";

/** Series resistor into a symmetric antiparallel silicon diode pair to ground - the classic passive hard clipper. */
export const diodeClipperPreset: PedalPreset = {
  id: "diode-clipper",
  name: "다이오드 클리퍼 (대칭)",
  description: "저항 + 대칭 실리콘 다이오드 페어 - 하드 클리핑 디스토션",
  category: "디스토션",
  inputSourceId: "V1",
  tapNodes: ["in", "out"],
  outputNode: "out",
  defaultParams: {
    seriesResistance: 10_000,
  },
  // Functional decomposition (docs/plan-core-fundamentals.md B-5): loads as labelled blocks that can be
  // collapsed into black boxes; knobs load as real potentiometers.
  blocks: [
    { id: "clip", label: "대칭 실리콘 클리핑", category: "clipping", elements: ["R1", "D1", "D2"], ports: [{ kind: "in", node: "in" }, { kind: "out", node: "out" }] },
  ],
  build: (params) => ({
    elements: [
      { id: "V1", type: "vsource", nodes: ["in", "0"], voltage: 0 },
      { id: "R1", type: "resistor", nodes: ["in", "out"], resistance: params.seriesResistance },
      { id: "D1", type: "diode", nodes: ["out", "0"], ...SILICON_DIODE_1N4148 },
      { id: "D2", type: "diode", nodes: ["0", "out"], ...SILICON_DIODE_1N4148 },
    ],
  }),
};
