import type { PedalPreset } from "../../types";
import { GENERIC_SILICON_NPN } from "../../deviceModels";

/**
 * Single-transistor NPN common-emitter clean boost, the LPB-1-style topology: a fixed base voltage
 * divider (430k/43k from the 9V rail) sets the bias point, and the emitter resistor is left
 * UN-bypassed - no emitter capacitor - trading maximum gain for a stable, predictable gain fixed by
 * Rc/Re (~25x with the stock 10k/390 values) rather than the device's raw, part-to-part-variable hFE.
 * That's the whole reason this circuit reads as a flat, transparent boost rather than an overdrive:
 * every frequency gets the same gain, and the un-bypassed emitter keeps it well short of clipping at
 * normal signal levels. See docs/plan-circuit-archive.md for sourcing notes.
 */
export const lpb1StyleBoostPreset: PedalPreset = {
  id: "lpb1-style-boost",
  name: "클린 부스트 (LPB-1 스타일, 단일 트랜지스터)",
  description: "NPN 공통-이미터 증폭 + 언바이패스 이미터 저항 - Rc/Re로 고정되는 평탄한 부스트 게인",
  category: "부스트",
  inputSourceId: "V1",
  tapNodes: ["in", "base", "coll", "outAC"],
  outputNode: "outAC",
  defaultParams: {
    collectorResistance: 10_000,
    emitterResistance: 390,
  },
  archive: {
    sourceRefs: [
      { label: "tampco.fr - EHX LPB-1 circuit analysis (topology/values reference, not copied)", url: "https://tampco.fr/en/blog/post/21-circuit-analysis-electro-harmonix-lpb1" },
      { label: "coda-effects.com - LPB1 circuit analysis (topology reference, not copied)", url: "https://www.coda-effects.com/p/lpb1-circuit-analysis.html" },
    ],
    disclaimer: "대표값 근사치이며 특정 상용 제품의 실측 회로도가 아닙니다.",
  },
  // Functional decomposition (docs/plan-core-fundamentals.md B-5): loads as labelled blocks that can be
  // collapsed into black boxes; knobs load as real potentiometers.
  blocks: [
    { id: "power", label: "전원 (9V)", category: "power", elements: ["Vcc", "Vdd"], ports: [{ kind: "supply", node: "vcc", label: "9V" }] },
    { id: "boost", label: "공통 이미터 부스트", category: "gain", elements: ["Cin", "Rb1", "Rb2", "Q1", "Rc", "Re"], ports: [{ kind: "in", node: "in" }, { kind: "out", node: "coll" }, { kind: "supply", node: "vcc", label: "V+" }] },
    { id: "output", label: "출력 커플링", category: "output", elements: ["Cout", "Rload"], ports: [{ kind: "in", node: "coll" }, { kind: "out", node: "outAC" }] },
  ],
  build: (params) => ({
    elements: [
      { id: "V1", type: "vsource", nodes: ["in", "0"], voltage: 0 },
      { id: "Vcc", type: "vsource", nodes: ["vcc", "0"], voltage: 9 },

      { id: "Cin", type: "capacitor", nodes: ["in", "base"], capacitance: 0.1e-6 },
      { id: "Rb1", type: "resistor", nodes: ["vcc", "base"], resistance: 430_000 },
      { id: "Rb2", type: "resistor", nodes: ["base", "0"], resistance: 43_000 },

      { id: "Q1", type: "bjt", nodes: ["base", "coll", "emit"], polarity: "npn", ...GENERIC_SILICON_NPN },
      { id: "Rc", type: "resistor", nodes: ["vcc", "coll"], resistance: params.collectorResistance },
      // Deliberately no emitter bypass capacitor - see docstring.
      { id: "Re", type: "resistor", nodes: ["emit", "0"], resistance: params.emitterResistance },

      { id: "Cout", type: "capacitor", nodes: ["coll", "outAC"], capacitance: 0.1e-6 },
      // Stands in for the real pedal's output volume pot (a passive attenuator after this point,
      // not part of the gain stage) - omitted like the other single-stage boost/buffer presets.
      { id: "Rload", type: "resistor", nodes: ["outAC", "0"], resistance: 1_000_000 },
    ],
  }),
};
