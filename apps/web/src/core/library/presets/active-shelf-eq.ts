import type { PedalPreset } from "../types";

/**
 * Single-knob active treble-boost shelving EQ: an inverting op-amp stage
 * whose input impedance is Rin in series with (Rboost parallel Cboost).
 * Cboost shorts Rboost out at high frequency, raising the gain there
 * relative to the low-frequency plateau - a high shelf whose height is set
 * by Rboost (the tone knob).
 */
export const activeShelfEqPreset: PedalPreset = {
  id: "active-shelf-eq",
  name: "능동 EQ (고역 부스트 쉘빙)",
  description: "인버팅 연산증폭기 + 주파수 의존 입력 임피던스 - 고역 부스트량을 노브로 조절",
  category: "톤/EQ",
  inputSourceId: "V1",
  tapNodes: ["in", "out"],
  outputNode: "out",
  defaultParams: {
    tone: 0.5, // 0 = flat (no shelf), 1 = maximum high-frequency boost
    inputResistance: 10_000,
    feedbackResistance: 100_000,
  },
  // Functional decomposition (docs/plan-core-fundamentals.md B-5): loads as labelled blocks that can be
  // collapsed into black boxes; knobs load as real potentiometers.
  blocks: [
    { id: "eq", label: "능동 고음 셸프 EQ", category: "tone", elements: ["Rin", "Rboost", "Cboost", "Rf", "U1"], ports: [{ kind: "in", node: "in" }, { kind: "out", node: "out" }] },
  ],
  knobs: [
    { kind: "rheostat", id: "TREBLE", label: "TREBLE", element: "Rboost", maxResistance: 100_000, taper: "B" },
  ],
  build: (params) => {
    const rBoost = Math.max(params.tone * 100_000, 1);
    return {
      elements: [
        { id: "V1", type: "vsource", nodes: ["in", "0"], voltage: 0 },
        { id: "Rin", type: "resistor", nodes: ["in", "a"], resistance: params.inputResistance },
        { id: "Rboost", type: "resistor", nodes: ["a", "vminus"], resistance: rBoost },
        { id: "Cboost", type: "capacitor", nodes: ["a", "vminus"], capacitance: 1e-8 },
        { id: "Rf", type: "resistor", nodes: ["vminus", "out"], resistance: params.feedbackResistance },
        { id: "U1", type: "opamp", nodes: ["0", "vminus", "out"], openLoopGain: 1e5 },
      ],
    };
  },
};
