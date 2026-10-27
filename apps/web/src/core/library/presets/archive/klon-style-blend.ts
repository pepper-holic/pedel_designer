import type { PedalPreset } from "../../types";
import { SILICON_DIODE_1N4148 } from "../../deviceModels";

/**
 * "Klon-style" clean/drive blend: a clean unity buffer and an inverting clipping gain stage run in
 * parallel off the same input, summed through a resistor divider ("blend"), then re-buffered to a
 * low-impedance output. Structurally this is the first preset in the library with two independent
 * signal paths mixed together, exercising the MNA solver's handling of a passive summing node fed
 * by two op-amp outputs. See docs/plan-circuit-archive.md for sourcing notes - a representative
 * reconstruction of the general topology, not a trace of any specific commercial pedal's schematic.
 */
export const klonStyleBlendPreset: PedalPreset = {
  id: "klon-style-blend",
  name: "Klon 스타일 클린/드라이브 블렌드",
  description: "클린 버퍼 경로 + 클리핑 드라이브 경로를 저항 분배로 합치는 병렬 블렌드 구조",
  category: "오버드라이브",
  inputSourceId: "V1",
  tapNodes: ["in", "cleanOut", "driveOut", "mix", "out"],
  outputNode: "out",
  defaultParams: {
    inputResistance: 10_000,
    feedbackResistance: 200_000,
    blendCleanResistance: 100_000,
    blendDriveResistance: 20_000,
  },
  archive: {
    sourceRefs: [
      { label: "muzique.com (R.G. Keen / AMZ) - DIY circuit theory articles (topology reference, not copied)", url: "https://www.muzique.com/" },
      { label: "freestompboxes.org - community-contributed circuit archive", url: "https://www.freestompboxes.org/" },
    ],
    disclaimer: "대표값 근사치이며 특정 상용 제품의 실측 회로도가 아닙니다.",
  },
  // Functional decomposition (docs/plan-core-fundamentals.md B-5): loads as labelled blocks that can be
  // collapsed into black boxes; knobs load as real potentiometers.
  blocks: [
    { id: "clean", label: "클린 버퍼", category: "buffer", elements: ["Uclean"], ports: [{ kind: "in", node: "in" }, { kind: "out", node: "cleanOut" }] },
    { id: "drive", label: "드라이브 단 (피드백 다이오드)", category: "clipping", elements: ["Rin", "Rf", "D1", "D2", "Udrive"], ports: [{ kind: "in", node: "in" }, { kind: "out", node: "driveOut" }] },
    { id: "blend", label: "블렌드 + 출력 버퍼", category: "output", elements: ["Rblend1", "Rblend2", "Uout"], ports: [{ kind: "in", node: "cleanOut", label: "CLEAN" }, { kind: "aux", node: "driveOut", label: "DRIVE" }, { kind: "out", node: "out" }] },
  ],
  knobs: [
    { kind: "rheostat", id: "GAIN", label: "GAIN", element: "Rf", maxResistance: 400_000, taper: "B" },
    { kind: "pot", id: "BLEND", label: "BLEND", upper: "Rblend1", lower: "Rblend2", taper: "B" },
  ],
  build: (params) => ({
    elements: [
      { id: "V1", type: "vsource", nodes: ["in", "0"], voltage: 0 },

      // Clean path: unity-gain buffer straight off the input.
      { id: "Uclean", type: "opamp", nodes: ["in", "cleanOut", "cleanOut"], openLoopGain: 1e5 },

      // Drive path: inverting gain stage with antiparallel feedback-diode clipping.
      { id: "Rin", type: "resistor", nodes: ["in", "vminus"], resistance: params.inputResistance },
      { id: "Rf", type: "resistor", nodes: ["vminus", "driveOut"], resistance: params.feedbackResistance },
      { id: "D1", type: "diode", nodes: ["vminus", "driveOut"], ...SILICON_DIODE_1N4148 },
      { id: "D2", type: "diode", nodes: ["driveOut", "vminus"], ...SILICON_DIODE_1N4148 },
      { id: "Udrive", type: "opamp", nodes: ["0", "vminus", "driveOut"], openLoopGain: 1e5 },

      // Blend: passive resistor summing of the two paths.
      { id: "Rblend1", type: "resistor", nodes: ["cleanOut", "mix"], resistance: params.blendCleanResistance },
      { id: "Rblend2", type: "resistor", nodes: ["driveOut", "mix"], resistance: params.blendDriveResistance },

      // Output buffer: re-isolates the blended node at low impedance.
      { id: "Uout", type: "opamp", nodes: ["mix", "out", "out"], openLoopGain: 1e5 },
    ],
  }),
};
