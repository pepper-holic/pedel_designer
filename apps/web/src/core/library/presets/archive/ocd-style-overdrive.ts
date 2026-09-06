import type { PedalPreset } from "../../types";
import { SILICON_DIODE_1N4148, GERMANIUM_DIODE } from "../../deviceModels";

/**
 * "Hard-clipping hybrid" overdrive: an inverting op-amp gain stage feeding an output-shunt clipper
 * (clipping outside the feedback loop, same pattern as ratStyleDistortionPreset) whose two legs are
 * DIFFERENT diode types - one silicon, one germanium - the well-documented trait that gives this
 * family its slightly asymmetric hard-clipping character instead of the perfectly symmetric clip a
 * matched diode pair produces. `brightSwitch` approximates the pedal's treble-bleed tone switch: a
 * small capacitor bypassing the current-limiting resistor at high frequencies when enabled. See
 * docs/plan-circuit-archive.md for sourcing notes - a representative reconstruction of the general
 * topology, not a trace of any specific commercial pedal's exact schematic.
 */
export const ocdStyleOverdrivePreset: PedalPreset = {
  id: "ocd-style-overdrive",
  name: "하드 클리핑 오버드라이브 (비대칭 실리콘+게르마늄 션트)",
  description: "인버팅 op-amp 게인 스테이지 + 출력단 비대칭(실리콘/게르마늄) 하드 클리핑, brightSwitch로 트레블 브리드 전환",
  category: "오버드라이브",
  inputSourceId: "V1",
  tapNodes: ["in", "opout", "out", "outAC"],
  outputNode: "outAC",
  defaultParams: {
    gainResistance: 47_000,
    /** 0 = off, 1 = bypass the series resistor at high frequencies (brighter/harder). */
    brightSwitch: 0,
  },
  variants: [
    { id: "normal", label: "노멀 (트레블 브리드 없음)", params: { brightSwitch: 0 } },
    { id: "bright", label: "브라이트 (트레블 브리드 켬)", params: { brightSwitch: 1 } },
  ],
  archive: {
    sourceRefs: [
      { label: "Analog Is Not Dead - Fulltone OCD circuit analysis (topology reference, not copied)", url: "https://analogisnotdead.com/article34/circuit-analysis-fulltone-s-ocd" },
      { label: "ElectroSmash - circuit analysis articles (topology reference, not copied)", url: "https://www.electrosmash.com/" },
    ],
    disclaimer: "대표값 근사치이며 특정 상용 제품의 실측 회로도가 아닙니다.",
  },
  build: (params) => ({
    elements: [
      { id: "V1", type: "vsource", nodes: ["in", "0"], voltage: 0 },
      { id: "Rin", type: "resistor", nodes: ["in", "vminus"], resistance: 10_000 },
      { id: "Rf", type: "resistor", nodes: ["vminus", "opout"], resistance: params.gainResistance },
      { id: "U1", type: "opamp", nodes: ["0", "vminus", "opout"], openLoopGain: 1e5 },
      { id: "Rs", type: "resistor", nodes: ["opout", "out"], resistance: 1_000 },
      { id: "D1", type: "diode", nodes: ["out", "0"], ...SILICON_DIODE_1N4148 },
      { id: "D2", type: "diode", nodes: ["0", "out"], ...GERMANIUM_DIODE },
      ...(params.brightSwitch >= 1 ? [{ id: "Cbright", type: "capacitor" as const, nodes: ["opout", "out"] as [string, string], capacitance: 1e-9 }] : []),
      { id: "Cout", type: "capacitor", nodes: ["out", "outAC"], capacitance: 0.1e-6 },
      { id: "Rload", type: "resistor", nodes: ["outAC", "0"], resistance: 1_000_000 },
    ],
  }),
};
