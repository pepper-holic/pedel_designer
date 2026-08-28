import type { PedalPreset } from "../types";
import { GENERIC_NCHANNEL_JFET } from "../deviceModels";

/**
 * Self-biased common-source JFET clean boost: the gate sits at ~0V through a large bias resistor
 * (negligible DC gate current), the source resistor sets the operating point via source
 * self-bias (Vgs = -Id*Rs), and a bypassed source resistor plus drain load gives voltage gain
 * (~gm*Rd) with the inherent soft, even-harmonic-leaning overload character JFETs are picked for
 * in guitar boost/buffer circuits.
 */
export const jfetBoostPreset: PedalPreset = {
  id: "jfet-boost",
  name: "JFET 클린 부스트 (공통-소스 증폭단)",
  description: "N채널 JFET 셀프 바이어스 공통-소스 증폭 - 게인 부스트, 소자 자체의 부드러운 오버로드 특성",
  inputSourceId: "V1",
  tapNodes: ["in", "gate", "source", "drain", "outAC"],
  outputNode: "outAC",
  defaultParams: {
    drainResistance: 4_700,
    sourceResistance: 1_000,
    gateResistance: 1_000_000,
  },
  build: (params) => ({
    elements: [
      { id: "V1", type: "vsource", nodes: ["in", "0"], voltage: 0 },
      { id: "Vdd", type: "vsource", nodes: ["vdd", "0"], voltage: 9 },

      { id: "Cin", type: "capacitor", nodes: ["in", "gate"], capacitance: 0.1e-6 },
      { id: "Rg", type: "resistor", nodes: ["gate", "0"], resistance: params.gateResistance },
      { id: "Q1", type: "jfet", nodes: ["gate", "drain", "source"], ...GENERIC_NCHANNEL_JFET },
      { id: "Rd", type: "resistor", nodes: ["vdd", "drain"], resistance: params.drainResistance },
      { id: "Rs", type: "resistor", nodes: ["source", "0"], resistance: params.sourceResistance },
      { id: "Cs", type: "capacitor", nodes: ["source", "0"], capacitance: 47e-6 },

      { id: "Cout", type: "capacitor", nodes: ["drain", "outAC"], capacitance: 0.1e-6 },
      { id: "Rload", type: "resistor", nodes: ["outAC", "0"], resistance: 1_000_000 },
    ],
  }),
};
