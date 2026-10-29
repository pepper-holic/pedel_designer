import type { PedalPreset } from "../../types";
import { GERMANIUM_DIODE, GENERIC_SILICON_NPN } from "../../deviceModels";

/**
 * Electra-style distortion: the simplest distortion in the library - one NPN common-emitter stage
 * (base biased straight from the rail through 2.2M, 4.7k collector, 470R emitter, gain ~9x) and a
 * germanium shunt diode pair hung on the AC-coupled output. There is no series resistor in front of
 * the diodes: the stage's own 4.7k collector impedance is what limits the clipping current, so the
 * diodes load the stage directly and the ~0.3V germanium knee does the rest. The original had no
 * controls at all - the guitar's volume knob set the drive. See docs/plan-circuit-archive.md.
 */
export const electraStyleDistortionPreset: PedalPreset = {
  id: "electra-style-distortion",
  name: "디스토션 (단일 트랜지스터 + 저마늄 션트, Electra 스타일)",
  description: "NPN 공통 이미터 한 단 + 출력에 바로 매단 저마늄 다이오드 쌍 - 컬렉터 저항이 전류 제한을 겸하는 최소 구성 디스토션",
  category: "디스토션",
  inputSourceId: "V1",
  tapNodes: ["in", "coll", "out"],
  outputNode: "out",
  defaultParams: {
    collectorResistance: 4_700,
    emitterResistance: 470,
  },
  archive: {
    sourceRefs: [
      { label: "muzique.com (AMZ) - Electra distortion (topology/values reference, not copied)", url: "https://www.muzique.com/tech/electra.htm" },
    ],
    disclaimer: "대표값 근사치이며 특정 상용 제품의 실측 회로도가 아닙니다.",
  },
  // Functional decomposition (docs/plan-core-fundamentals.md B-5): loads as labelled blocks that can be
  // collapsed into black boxes; knobs load as real potentiometers.
  blocks: [
    { id: "power", label: "전원 (9V)", category: "power", elements: ["Vcc", "Vdd"], ports: [{ kind: "supply", node: "vcc", label: "9V" }] },
    { id: "gain", label: "공통 이미터 증폭", category: "gain", elements: ["Cin", "Rb", "Q1", "Rc", "Re"], ports: [{ kind: "in", node: "in" }, { kind: "out", node: "coll" }, { kind: "supply", node: "vcc", label: "V+" }] },
    { id: "clip", label: "저마늄 션트 클리핑", category: "clipping", elements: ["Cout", "D1", "D2", "Rload"], ports: [{ kind: "in", node: "coll" }, { kind: "out", node: "out" }] },
  ],
  build: (params) => ({
    elements: [
      { id: "V1", type: "vsource", nodes: ["in", "0"], voltage: 0 },
      { id: "Vcc", type: "vsource", nodes: ["vcc", "0"], voltage: 9, role: "supply" },

      { id: "Cin", type: "capacitor", nodes: ["in", "base"], capacitance: 0.1e-6 },
      // Base biased from the rail, not from the collector - the bias current is fixed by Rb alone.
      { id: "Rb", type: "resistor", nodes: ["vcc", "base"], resistance: 2_200_000 },
      { id: "Q1", type: "bjt", nodes: ["base", "coll", "emit"], polarity: "npn", ...GENERIC_SILICON_NPN },
      { id: "Rc", type: "resistor", nodes: ["vcc", "coll"], resistance: params.collectorResistance },
      { id: "Re", type: "resistor", nodes: ["emit", "0"], resistance: params.emitterResistance },

      { id: "Cout", type: "capacitor", nodes: ["coll", "out"], capacitance: 0.1e-6 },
      { id: "D1", type: "diode", nodes: ["out", "0"], ...GERMANIUM_DIODE },
      { id: "D2", type: "diode", nodes: ["0", "out"], ...GERMANIUM_DIODE },
      { id: "Rload", type: "resistor", nodes: ["out", "0"], resistance: 1_000_000 },
    ],
  }),
};
