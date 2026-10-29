import type { PedalPreset } from "../../types";

/**
 * Micro-Amp-style clean boost: a single non-inverting op-amp stage and nothing else - no clipping,
 * no tone. Gain = 1 + Rf/Rg where Rf is the GAIN pot in parallel with a fixed 56k, so the knob runs
 * from unity (pot at zero shorts the feedback) up to about 20x (~26dB) rather than the 180x the bare
 * pot would allow; Cg in the ground leg keeps the DC gain at unity so the bias point never moves with
 * the knob. The 10M input bias resistor is what gives this family its very high input impedance.
 * See docs/plan-circuit-archive.md for sourcing notes.
 */
export const microAmpStyleBoostPreset: PedalPreset = {
  id: "micro-amp-style-boost",
  name: "클린 부스트 (논인버팅 op-amp, Micro Amp 스타일)",
  description: "논인버팅 op-amp 한 단 - 56k와 병렬인 게인 팟으로 1배~약 20배(26dB)까지, 접지 다리의 커패시터로 DC 게인은 1배 고정",
  category: "부스트",
  inputSourceId: "V1",
  tapNodes: ["in", "vplus", "opout", "out"],
  outputNode: "out",
  defaultParams: {
    gainResistance: 100_000,
  },
  archive: {
    sourceRefs: [
      { label: "ElectroSmash - MXR Micro Amp analysis (topology/values reference, not copied)", url: "https://www.electrosmash.com/mxr-microamp" },
    ],
    disclaimer: "대표값 근사치이며 특정 상용 제품의 실측 회로도가 아닙니다.",
  },
  // Functional decomposition (docs/plan-core-fundamentals.md B-5): loads as labelled blocks that can be
  // collapsed into black boxes; knobs load as real potentiometers.
  blocks: [
    { id: "gain", label: "논인버팅 게인 단", category: "gain", elements: ["Cin", "Rbias", "U1", "Rfix", "Rf", "Rg", "Cg"], ports: [{ kind: "in", node: "in" }, { kind: "out", node: "opout" }] },
    { id: "output", label: "출력 커플링", category: "output", elements: ["Rout", "Cout", "Rload"], ports: [{ kind: "in", node: "opout" }, { kind: "out", node: "out" }] },
  ],
  knobs: [
    { kind: "rheostat", id: "GAIN", label: "GAIN", element: "Rf", maxResistance: 500_000, taper: "C" },
  ],
  build: (params) => ({
    elements: [
      { id: "V1", type: "vsource", nodes: ["in", "0"], voltage: 0 },

      { id: "Cin", type: "capacitor", nodes: ["in", "vplus"], capacitance: 0.1e-6 },
      { id: "Rbias", type: "resistor", nodes: ["vplus", "0"], resistance: 10_000_000 },
      { id: "U1", type: "opamp", nodes: ["vplus", "vminus", "opout"], openLoopGain: 1e5 },
      // Fixed 56k in parallel with the pot caps the maximum gain.
      { id: "Rfix", type: "resistor", nodes: ["vminus", "opout"], resistance: 56_000 },
      { id: "Rf", type: "resistor", nodes: ["vminus", "opout"], resistance: params.gainResistance },
      { id: "Rg", type: "resistor", nodes: ["vminus", "gleg"], resistance: 2_700 },
      { id: "Cg", type: "capacitor", nodes: ["gleg", "0"], capacitance: 4.7e-6 },

      { id: "Rout", type: "resistor", nodes: ["opout", "outdc"], resistance: 470 },
      { id: "Cout", type: "capacitor", nodes: ["outdc", "out"], capacitance: 15e-6 },
      { id: "Rload", type: "resistor", nodes: ["out", "0"], resistance: 10_000 },
    ],
  }),
};
