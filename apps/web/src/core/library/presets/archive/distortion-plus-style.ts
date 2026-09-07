import type { PedalPreset } from "../../types";
import { SILICON_DIODE_1N4148, GERMANIUM_DIODE } from "../../deviceModels";

/**
 * The minimum viable op-amp distortion, in the Distortion+/250 style: one non-inverting gain stage
 * and a pair of diodes shunting its output to ground.
 *
 * With the clipping outside the feedback loop the op-amp keeps its full gain right up to the diode
 * knee and then the diodes simply hold the output there - a harder, more abrupt edge than the
 * feedback clippers (TS-style) that soften as they compress. It is the same clipping position the
 * RAT-style preset uses; what differs here is that the gain stage in front is non-inverting and
 * there is no tone control at all, so nothing rounds off the result.
 *
 * See docs/plan-circuit-archive.md for sourcing notes.
 */
export const distortionPlusStylePreset: PedalPreset = {
  id: "distortion-plus-style",
  name: "디스토션 (논인버팅 + 출력단 션트 클리핑, Distortion+ 스타일)",
  description: "논인버팅 op-amp 게인 + 출력단 다이오드 션트 클리핑, 톤 컨트롤 없음 - 가장 단순한 op-amp 디스토션",
  category: "디스토션",
  inputSourceId: "V1",
  tapNodes: ["in", "opout", "out"],
  outputNode: "out",
  defaultParams: {
    gainResistance: 1_000_000,
    /** 0 = matched silicon (symmetric), 1 = one silicon / one germanium (asymmetric). */
    clipAsymmetry: 0,
  },
  variants: [
    { id: "silicon", label: "실리콘 대칭 클리핑", params: { clipAsymmetry: 0 } },
    { id: "asymmetric", label: "실리콘/게르마늄 비대칭", params: { clipAsymmetry: 1 } },
  ],
  archive: {
    sourceRefs: [
      { label: "electrosmash.com - MXR Distortion+ analysis (topology/values reference, not copied)", url: "https://www.electrosmash.com/mxr-distortion-plus-analysis" },
    ],
    disclaimer: "대표값 근사치이며 특정 상용 제품의 실측 회로도가 아닙니다.",
  },
  build: (params) => ({
    elements: [
      { id: "V1", type: "vsource", nodes: ["in", "0"], voltage: 0 },
      { id: "Cin", type: "capacitor", nodes: ["in", "vplus"], capacitance: 0.01e-6 },
      { id: "Rbias", type: "resistor", nodes: ["vplus", "0"], resistance: 1_000_000 },

      // Non-inverting stage: gain is 1 + Rf/Rg, set by the drive control.
      { id: "U1", type: "opamp", nodes: ["vplus", "vminus", "opout"], openLoopGain: 1e5 },
      { id: "Rg", type: "resistor", nodes: ["vminus", "0"], resistance: 4_700 },
      { id: "Rf", type: "resistor", nodes: ["vminus", "opout"], resistance: params.gainResistance },

      // Current-limiting resistor then the shunt pair, exactly as in the RAT-style preset: hanging
      // diodes straight off an ideal op-amp output would clip nothing, because the feedback loop
      // holds that node regardless of the diode current.
      { id: "Rs", type: "resistor", nodes: ["opout", "out"], resistance: 10_000 },
      { id: "D1", type: "diode", nodes: ["out", "0"], ...SILICON_DIODE_1N4148 },
      { id: "D2", type: "diode", nodes: ["0", "out"], ...(params.clipAsymmetry >= 1 ? GERMANIUM_DIODE : SILICON_DIODE_1N4148) },
      { id: "Rload", type: "resistor", nodes: ["out", "0"], resistance: 1_000_000 },
    ],
  }),
};
