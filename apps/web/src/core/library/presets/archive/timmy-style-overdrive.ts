import type { PedalPreset } from "../../types";
import { SILICON_DIODE_1N4148, GENERIC_NCHANNEL_JFET } from "../../deviceModels";

/**
 * "Transparent"-style overdrive: a JFET common-source stage ahead of an inverting op-amp gain
 * stage clipped by only ONE diode pair in the feedback loop (rather than the 4-diode feedback
 * pairs most TS-derived circuits use), followed by a passive RC tone stack. The defining
 * structural trait this reconstructs is the *low diode count* in feedback - it raises the
 * clipping threshold and softens the knee compared to this app's other feedback-clipped presets
 * (ts9OverdrivePreset, opampDrivePreset), which is the well-documented reason circuits in this
 * family are perceived as "transparent"/EQ-like rather than heavily compressed. See
 * docs/plan-circuit-archive.md for sourcing notes - a representative reconstruction of the general
 * topology, not a trace of any specific commercial pedal's exact schematic.
 */
export const timmyStyleOverdrivePreset: PedalPreset = {
  id: "timmy-style-overdrive",
  name: "트랜스페어런트 오버드라이브 (JFET+싱글 다이오드 피드백)",
  description: "JFET 부스트 단 + 피드백 루프 내 단일 다이오드 페어(저압축) 클리핑 + 패시브 톤 스택",
  category: "오버드라이브",
  inputSourceId: "V1",
  tapNodes: ["in", "boosted", "clipped", "out"],
  outputNode: "out",
  defaultParams: {
    feedbackResistance: 47_000,
    tone: 0.5,
    shuntCapacitance: 2.2e-9,
  },
  archive: {
    sourceRefs: [
      { label: "coda-effects.com - Jan Ray / Timmy circuit analysis (topology reference, not copied)", url: "http://www.coda-effects.com/p/circuit-analysis-jan-ray-timmy.html" },
      { label: "ElectroSmash - circuit analysis articles (topology reference, not copied)", url: "https://www.electrosmash.com/" },
    ],
    disclaimer: "대표값 근사치이며 특정 상용 제품의 실측 회로도가 아닙니다.",
  },
  build: (params) => ({
    elements: [
      { id: "V1", type: "vsource", nodes: ["in", "0"], voltage: 0 },
      { id: "Vdd", type: "vsource", nodes: ["vdd", "0"], voltage: 9 },

      { id: "Cin", type: "capacitor", nodes: ["in", "gate"], capacitance: 0.1e-6 },
      { id: "Rg", type: "resistor", nodes: ["gate", "0"], resistance: 1_000_000 },
      { id: "Q1", type: "jfet", nodes: ["gate", "drain", "source"], ...GENERIC_NCHANNEL_JFET },
      { id: "Rd", type: "resistor", nodes: ["vdd", "drain"], resistance: 4_700 },
      { id: "Rs", type: "resistor", nodes: ["source", "0"], resistance: 1_000 },
      { id: "Cs", type: "capacitor", nodes: ["source", "0"], capacitance: 47e-6 },
      { id: "Cboost", type: "capacitor", nodes: ["drain", "boosted"], capacitance: 0.1e-6 },
      { id: "Rload1", type: "resistor", nodes: ["boosted", "0"], resistance: 1_000_000 },

      { id: "Rin2", type: "resistor", nodes: ["boosted", "vminus"], resistance: 10_000 },
      { id: "Rf2", type: "resistor", nodes: ["vminus", "clipped"], resistance: params.feedbackResistance },
      { id: "D1", type: "diode", nodes: ["clipped", "vminus"], ...SILICON_DIODE_1N4148 },
      { id: "D2", type: "diode", nodes: ["vminus", "clipped"], ...SILICON_DIODE_1N4148 },
      { id: "U2", type: "opamp", nodes: ["0", "vminus", "clipped"], openLoopGain: 1e5 },

      { id: "Rtone", type: "resistor", nodes: ["clipped", "toned"], resistance: Math.max(100_000 * (1 - params.tone), 50) },
      { id: "Ctone", type: "capacitor", nodes: ["toned", "0"], capacitance: params.shuntCapacitance },
      { id: "Cout", type: "capacitor", nodes: ["toned", "out"], capacitance: 0.1e-6 },
      { id: "Rload2", type: "resistor", nodes: ["out", "0"], resistance: 1_000_000 },
    ],
  }),
};
