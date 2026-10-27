import type { PedalPreset } from "../../types";
import { GENERIC_GERMANIUM_PNP } from "../../deviceModels";

/**
 * Germanium PNP treble booster in the Rangemaster style.
 *
 * The whole circuit is one common-emitter stage, and what makes it a *treble* booster is a single
 * part: a small input coupling capacitor. At 5nF into the stage's input impedance the corner lands
 * up in the low mids, so everything below it is thrown away before the transistor ever sees it.
 * Feeding an already-dirty amp only the top of the signal is why this reads as clarity rather than
 * as extra gain.
 *
 * Germanium PNP means the supply rail is negative with respect to ground, which is expressed here by
 * a -9V source rather than by flipping the ground reference. See docs/plan-circuit-archive.md for
 * sourcing notes.
 */
export const rangemasterStyleTrebleBoostPreset: PedalPreset = {
  id: "rangemaster-style-treble-boost",
  name: "트레블 부스터 (게르마늄 PNP, Rangemaster 스타일)",
  description: "단일 게르마늄 PNP 공통-이미터 + 작은 입력 커패시터로 저음을 잘라내는 트레블 전용 부스터",
  category: "부스트",
  inputSourceId: "V1",
  tapNodes: ["in", "base", "coll", "out"],
  outputNode: "out",
  defaultParams: {
    /** The part that decides how much low end survives - the reason this is a treble booster. */
    inputCapacitance: 5e-9,
    collectorResistance: 3_900,
    emitterResistance: 3_900,
  },
  variants: [
    { id: "treble", label: "트레블 부스트 (5nF)", params: { inputCapacitance: 5e-9 } },
    { id: "fullrange", label: "풀레인지 부스트 (100nF)", params: { inputCapacitance: 100e-9 } },
  ],
  archive: {
    sourceRefs: [
      { label: "electrosmash.com - Dallas Rangemaster analysis (topology/values reference, not copied)", url: "https://www.electrosmash.com/dallas-rangemaster" },
    ],
    disclaimer: "대표값 근사치이며 특정 상용 제품의 실측 회로도가 아닙니다.",
  },
  // Functional decomposition (docs/plan-core-fundamentals.md B-5): loads as labelled blocks that can be
  // collapsed into black boxes; knobs load as real potentiometers.
  blocks: [
    { id: "power", label: "전원 (-9V)", category: "power", elements: ["Vcc", "Vdd"], ports: [{ kind: "supply", node: "vcc", label: "-9V" }] },
    { id: "boost", label: "트레블 부스트 (게르마늄 PNP)", category: "gain", elements: ["Cin", "Rb1", "Rb2", "Q1", "Rc", "Re", "Ce"], ports: [{ kind: "in", node: "in" }, { kind: "out", node: "coll" }, { kind: "supply", node: "vcc", label: "-9V" }] },
    { id: "output", label: "출력 커플링", category: "output", elements: ["Cout", "Rload"], ports: [{ kind: "in", node: "coll" }, { kind: "out", node: "out" }] },
  ],
  build: (params) => ({
    elements: [
      { id: "V1", type: "vsource", nodes: ["in", "0"], voltage: 0 },
      // Negative rail: a PNP stage sinks its collector current toward the negative supply.
      { id: "Vcc", type: "vsource", nodes: ["vcc", "0"], voltage: -9 },

      { id: "Cin", type: "capacitor", nodes: ["in", "base"], capacitance: params.inputCapacitance },
      { id: "Rb1", type: "resistor", nodes: ["vcc", "base"], resistance: 470_000 },
      { id: "Rb2", type: "resistor", nodes: ["base", "0"], resistance: 68_000 },

      { id: "Q1", type: "bjt", nodes: ["base", "coll", "emit"], polarity: "pnp", ...GENERIC_GERMANIUM_PNP },
      { id: "Rc", type: "resistor", nodes: ["vcc", "coll"], resistance: params.collectorResistance },
      { id: "Re", type: "resistor", nodes: ["emit", "0"], resistance: params.emitterResistance },
      // Bypassing the emitter resistor is what lifts the gain from Rc/Re to the device's own.
      { id: "Ce", type: "capacitor", nodes: ["emit", "0"], capacitance: 47e-6 },

      { id: "Cout", type: "capacitor", nodes: ["coll", "out"], capacitance: 4.7e-9 },
      { id: "Rload", type: "resistor", nodes: ["out", "0"], resistance: 1_000_000 },
    ],
  }),
};
