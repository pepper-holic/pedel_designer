import type { PedalPreset } from "../../types";
import { SILICON_DIODE_1N4148 } from "../../deviceModels";

/**
 * "Non-inverting gain + 4-diode feedback clipper" overdrive: the defining structural trait this
 * reconstructs is putting the FIRST gain stage in the NON-INVERTING op-amp configuration (higher
 * input impedance, gain = 1 + Rf/Rg) rather than inverting like every other op-amp preset in this
 * library - a second, separate inverting stage then does the actual clipping through two
 * series-diode pairs in its feedback loop (raising the clipping threshold above a single-diode
 * pair, for a smoother/later-breaking overdrive), followed by a passive RC tone stack. See
 * docs/plan-circuit-archive.md for sourcing notes - a representative reconstruction of the general
 * topology, not a trace of any specific commercial pedal's exact schematic.
 */
export const bluesbreakerStyleOverdrivePreset: PedalPreset = {
  id: "bluesbreaker-style-overdrive",
  name: "논인버팅 오버드라이브 (2단 Op-Amp, 4-다이오드 피드백)",
  description: "논인버팅 게인 스테이지 + 인버팅 4-다이오드 피드백 클리퍼 + 패시브 톤 스택",
  category: "오버드라이브",
  inputSourceId: "V1",
  tapNodes: ["in", "boosted", "clipped", "out"],
  outputNode: "out",
  defaultParams: {
    gainResistance: 100_000,
    tone: 0.5,
  },
  archive: {
    sourceRefs: [
      { label: "PedalPCB community forum - clipping-diode placement discussion (topology reference, not copied)", url: "https://forum.pedalpcb.com/threads/what-clips-first-opamps-or-diodes.17010/" },
      { label: "ElectroSmash - circuit analysis articles (topology reference, not copied)", url: "https://www.electrosmash.com/" },
    ],
    disclaimer: "대표값 근사치이며 특정 상용 제품의 실측 회로도가 아닙니다.",
  },
  build: (params) => ({
    elements: [
      { id: "V1", type: "vsource", nodes: ["in", "0"], voltage: 0 },

      { id: "Cin", type: "capacitor", nodes: ["in", "vplus"], capacitance: 0.1e-6 },
      { id: "Rbias", type: "resistor", nodes: ["vplus", "0"], resistance: 1_000_000 },
      { id: "Rg", type: "resistor", nodes: ["vminus1", "0"], resistance: 4_700 },
      { id: "Rf1", type: "resistor", nodes: ["vminus1", "boosted"], resistance: params.gainResistance },
      { id: "U1", type: "opamp", nodes: ["vplus", "vminus1", "boosted"], openLoopGain: 1e5 },

      { id: "Rin2", type: "resistor", nodes: ["boosted", "vminus2"], resistance: 10_000 },
      { id: "Rf2", type: "resistor", nodes: ["vminus2", "clipped"], resistance: 100_000 },
      { id: "D1a", type: "diode", nodes: ["vminus2", "mid1"], ...SILICON_DIODE_1N4148 },
      { id: "D1b", type: "diode", nodes: ["mid1", "clipped"], ...SILICON_DIODE_1N4148 },
      { id: "D2a", type: "diode", nodes: ["clipped", "mid2"], ...SILICON_DIODE_1N4148 },
      { id: "D2b", type: "diode", nodes: ["mid2", "vminus2"], ...SILICON_DIODE_1N4148 },
      { id: "U2", type: "opamp", nodes: ["0", "vminus2", "clipped"], openLoopGain: 1e5 },

      { id: "Rtone", type: "resistor", nodes: ["clipped", "toned"], resistance: Math.max(100_000 * (1 - params.tone), 50) },
      { id: "Ctone", type: "capacitor", nodes: ["toned", "0"], capacitance: 4.7e-9 },
      { id: "Cout", type: "capacitor", nodes: ["toned", "out"], capacitance: 0.1e-6 },
      { id: "Rload", type: "resistor", nodes: ["out", "0"], resistance: 1_000_000 },
    ],
  }),
};
