import type { PedalPreset } from "../../types";
import { SILICON_DIODE_1N4148, GENERIC_SILICON_NPN } from "../../deviceModels";

/**
 * Bazz-Fuss-style fuzz: one Darlington transistor whose only bias element is a diode from collector
 * to base. The diode conducts just enough base current to hold the collector a diode drop above the
 * base, i.e. barely a volt above ground. A positive half-cycle drives the transistor into saturation
 * and uses up that volt; a negative one cannot lift the collector either, because the same diode
 * clamps it a drop above the (now falling) base. The output is therefore a small, hard-gated and
 * brutally asymmetric square - the character this circuit is known for. Swapping the diode
 * (germanium, silicon, LED) moves the bias point and with it the whole feel, which is the one
 * "control" the design has. See docs/plan-circuit-archive.md.
 */
export const bazzFussStyleFuzzPreset: PedalPreset = {
  id: "bazz-fuss-style-fuzz",
  name: "퍼즈 (달링턴 1석 + 다이오드 바이어스, Bazz Fuss 스타일)",
  description: "컬렉터-베이스 다이오드 하나로 바이어스한 달링턴 공통 이미터 - 컬렉터가 1V 남짓에 앉아 한쪽은 포화, 다른 쪽은 다이오드에 묶이는 게이트 퍼즈",
  category: "퍼즈",
  inputSourceId: "V1",
  tapNodes: ["in", "base", "coll", "outAC"],
  outputNode: "outAC",
  defaultParams: {
    collectorResistance: 10_000,
  },
  archive: {
    sourceRefs: [
      { label: "home-wrecker.com - Bazz Fuss (topology/values reference, not copied)", url: "https://home-wrecker.com/bazz.html" },
    ],
    disclaimer: "대표값 근사치이며 특정 상용 제품의 실측 회로도가 아닙니다.",
  },
  // Functional decomposition (docs/plan-core-fundamentals.md B-5): loads as labelled blocks that can be
  // collapsed into black boxes; knobs load as real potentiometers.
  blocks: [
    { id: "power", label: "전원 (9V)", category: "power", elements: ["Vcc", "Vdd"], ports: [{ kind: "supply", node: "vcc", label: "9V" }] },
    { id: "fuzz", label: "달링턴 퍼즈 (다이오드 바이어스)", category: "fuzz", elements: ["Cin", "D1", "Q1", "Rc"], ports: [{ kind: "in", node: "in" }, { kind: "out", node: "coll" }, { kind: "supply", node: "vcc", label: "V+" }] },
    { id: "output", label: "출력 커플링", category: "output", elements: ["Cout", "Rload"], ports: [{ kind: "in", node: "coll" }, { kind: "out", node: "outAC" }] },
  ],
  build: (params) => ({
    elements: [
      { id: "V1", type: "vsource", nodes: ["in", "0"], voltage: 0 },
      { id: "Vcc", type: "vsource", nodes: ["vcc", "0"], voltage: 9, role: "supply" },

      { id: "Cin", type: "capacitor", nodes: ["in", "base"], capacitance: 0.056e-6 },
      // The bias diode: anode at the collector, cathode at the base.
      { id: "D1", type: "diode", nodes: ["coll", "base"], ...SILICON_DIODE_1N4148 },
      // Darlington pair approximated as one very-high-beta NPN with the emitter straight to ground.
      { id: "Q1", type: "bjt", nodes: ["base", "coll", "0"], polarity: "npn", ...GENERIC_SILICON_NPN, forwardBeta: 2_000 },
      { id: "Rc", type: "resistor", nodes: ["vcc", "coll"], resistance: params.collectorResistance },

      { id: "Cout", type: "capacitor", nodes: ["coll", "outAC"], capacitance: 0.047e-6 },
      // Stands in for the volume pot.
      { id: "Rload", type: "resistor", nodes: ["outAC", "0"], resistance: 100_000 },
    ],
  }),
};
