import type { PedalPreset } from "../types";
import { GENERIC_GERMANIUM_PNP } from "../deviceModels";

/**
 * Fuzz-Face-style two-transistor germanium fuzz: PNP stages direct-coupled
 * (Q1 collector feeds Q2 base with no capacitor), biased by a global
 * feedback resistor from Q2's collector back to Q1's base. Component values
 * are representative, not a trace of a specific vintage unit.
 *
 * Q1 carries a small emitter resistor (missing from some published fuzz-face
 * diagrams that ground the emitter directly): without it, this direct-coupled
 * two-stage loop has enough gain to become bistable and latches to a supply
 * rail instead of settling at a usable bias point.
 */
export const fuzzGermaniumPreset: PedalPreset = {
  id: "fuzz-germanium",
  name: "퍼즈 (2-트랜지스터 저마늄, Fuzz-Face 스타일)",
  description: "PNP 저마늄 트랜지스터 2단 직결 피드백 바이어스 퍼즈 회로",
  inputSourceId: "V1",
  tapNodes: ["in", "c1", "outc", "outAC"],
  outputNode: "outAC",
  defaultParams: {
    feedbackResistance: 100_000,
    collector1Resistance: 33_000,
    emitter1Resistance: 470,
    collector2Resistance: 8_200,
    emitter2Resistance: 100,
  },
  // Hand-tuned layout: Q1/Q2 in a left-to-right signal chain with their bias resistors stacked
  // above/below, and the global feedback resistor (Rfb) routed along the top rather than crossing
  // back through the middle of the stage as the BFS auto-layout tends to do.
  layout: {
    Rfb: { x: 400, y: 0 },
    Rc1: { x: 400, y: 150 },
    Rc2: { x: 570, y: 150 },
    V1: { x: 60, y: 300 },
    Cin: { x: 230, y: 300 },
    Q1: { x: 400, y: 300 },
    Q2: { x: 570, y: 300 },
    Cout: { x: 740, y: 300 },
    Rload: { x: 910, y: 300 },
    Vcc: { x: 60, y: 450 },
    Re1: { x: 400, y: 450 },
    Re2: { x: 570, y: 450 },
    Ce2: { x: 740, y: 450 },
  },
  build: (params) => ({
    elements: [
      { id: "V1", type: "vsource", nodes: ["in", "0"], voltage: 0 },
      { id: "Vcc", type: "vsource", nodes: ["0", "vneg"], voltage: 9 },

      { id: "Cin", type: "capacitor", nodes: ["in", "b1"], capacitance: 2.2e-6 },
      { id: "Rfb", type: "resistor", nodes: ["outc", "b1"], resistance: params.feedbackResistance },

      { id: "Q1", type: "bjt", nodes: ["b1", "c1", "e1"], polarity: "pnp", ...GENERIC_GERMANIUM_PNP },
      { id: "Re1", type: "resistor", nodes: ["e1", "0"], resistance: params.emitter1Resistance },
      { id: "Rc1", type: "resistor", nodes: ["vneg", "c1"], resistance: params.collector1Resistance },

      // Q1 collector (c1) is direct-coupled straight into Q2's base - the hallmark of the Fuzz Face topology.
      { id: "Q2", type: "bjt", nodes: ["c1", "outc", "e2"], polarity: "pnp", ...GENERIC_GERMANIUM_PNP },
      { id: "Rc2", type: "resistor", nodes: ["vneg", "outc"], resistance: params.collector2Resistance },
      { id: "Re2", type: "resistor", nodes: ["e2", "0"], resistance: params.emitter2Resistance },
      { id: "Ce2", type: "capacitor", nodes: ["e2", "0"], capacitance: 22e-6 },

      { id: "Cout", type: "capacitor", nodes: ["outc", "outAC"], capacitance: 1e-6 },
      { id: "Rload", type: "resistor", nodes: ["outAC", "0"], resistance: 1_000_000 },
    ],
  }),
};
