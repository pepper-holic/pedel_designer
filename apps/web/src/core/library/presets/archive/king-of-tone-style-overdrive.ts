import type { Element } from "../../../solver/types";
import type { PedalPreset } from "../../types";
import { SILICON_DIODE_1N4148 } from "../../deviceModels";

/**
 * "Dual-voicing" overdrive: the same non-inverting gain stage as bluesbreakerStyleOverdrivePreset,
 * but the second stage's clipping topology is chosen by `clipMode` - the well-documented trait of
 * pedals in this family is a switch that swaps between two clipping *placements* rather than two
 * diode types: `clipMode: 0` clips inside the second op-amp's feedback loop (soft, TS-like);
 * `clipMode: 1` clips the op-amp's own clean output through a current-limiting resistor (harder,
 * RAT-like - the same "clip outside the feedback loop" pattern as ratStyleDistortionPreset). See
 * docs/plan-circuit-archive.md for sourcing notes - a representative reconstruction of the general
 * topology, not a trace of any specific commercial pedal's exact schematic.
 */
export const kingOfToneStyleOverdrivePreset: PedalPreset = {
  id: "king-of-tone-style-overdrive",
  name: "듀얼 보이싱 오버드라이브 (피드백/션트 클리핑 전환)",
  description: "논인버팅 게인 스테이지 + clipMode로 전환되는 2가지 클리핑 배치(피드백 클리핑 vs 출력단 션트 클리핑)",
  category: "오버드라이브",
  inputSourceId: "V1",
  tapNodes: ["in", "boosted", "clipped", "out"],
  outputNode: "out",
  defaultParams: {
    gainResistance: 100_000,
    /** 0 = feedback-loop clipping (soft, TS-like), 1 = output-shunt clipping (hard, RAT-like). */
    clipMode: 0,
    tone: 0.5,
  },
  variants: [
    { id: "feedback", label: "피드백 루프 클리핑 (부드러움)", params: { clipMode: 0 } },
    { id: "shunt", label: "출력단 션트 클리핑 (단단함)", params: { clipMode: 1 } },
  ],
  archive: {
    sourceRefs: [
      { label: "Dirtbox Layouts - Analog Man King of Tone (topology reference, not copied)", url: "https://dirtboxlayouts.blogspot.com/2021/06/analog-man-king-of-tone.html" },
      { label: "Stanford CCRMA - King of Tone nodal DSP modeling paper (topology reference, not copied)", url: "https://ccrma.stanford.edu/~kaichieh/KingOfTone.pdf" },
    ],
    disclaimer: "대표값 근사치이며 특정 상용 제품의 실측 회로도가 아닙니다.",
  },
  build: (params) => {
    const firstStage: Element[] = [
      { id: "V1", type: "vsource", nodes: ["in", "0"], voltage: 0 },
      { id: "Cin", type: "capacitor", nodes: ["in", "vplus"], capacitance: 0.1e-6 },
      { id: "Rbias", type: "resistor", nodes: ["vplus", "0"], resistance: 1_000_000 },
      { id: "Rg", type: "resistor", nodes: ["vminus1", "0"], resistance: 4_700 },
      { id: "Rf1", type: "resistor", nodes: ["vminus1", "boosted"], resistance: params.gainResistance },
      { id: "U1", type: "opamp", nodes: ["vplus", "vminus1", "boosted"], openLoopGain: 1e5 },
    ];

    const secondStage: Element[] =
      params.clipMode >= 1
        ? [
            { id: "Rin2", type: "resistor", nodes: ["boosted", "vminus2"], resistance: 10_000 },
            { id: "Rf2", type: "resistor", nodes: ["vminus2", "opout"], resistance: 47_000 },
            { id: "U2", type: "opamp", nodes: ["0", "vminus2", "opout"], openLoopGain: 1e5 },
            { id: "Rs", type: "resistor", nodes: ["opout", "clipped"], resistance: 1_000 },
            { id: "D1", type: "diode", nodes: ["clipped", "0"], ...SILICON_DIODE_1N4148 },
            { id: "D2", type: "diode", nodes: ["0", "clipped"], ...SILICON_DIODE_1N4148 },
          ]
        : [
            { id: "Rin2", type: "resistor", nodes: ["boosted", "vminus2"], resistance: 10_000 },
            { id: "Rf2", type: "resistor", nodes: ["vminus2", "clipped"], resistance: 100_000 },
            { id: "D1a", type: "diode", nodes: ["vminus2", "mid1"], ...SILICON_DIODE_1N4148 },
            { id: "D1b", type: "diode", nodes: ["mid1", "clipped"], ...SILICON_DIODE_1N4148 },
            { id: "D2a", type: "diode", nodes: ["clipped", "mid2"], ...SILICON_DIODE_1N4148 },
            { id: "D2b", type: "diode", nodes: ["mid2", "vminus2"], ...SILICON_DIODE_1N4148 },
            { id: "U2", type: "opamp", nodes: ["0", "vminus2", "clipped"], openLoopGain: 1e5 },
          ];

    const tail: Element[] = [
      { id: "Rtone", type: "resistor", nodes: ["clipped", "toned"], resistance: Math.max(100_000 * (1 - params.tone), 50) },
      { id: "Ctone", type: "capacitor", nodes: ["toned", "0"], capacitance: 4.7e-9 },
      { id: "Cout", type: "capacitor", nodes: ["toned", "out"], capacitance: 0.1e-6 },
      { id: "Rload", type: "resistor", nodes: ["out", "0"], resistance: 1_000_000 },
    ];

    return { elements: [...firstStage, ...secondStage, ...tail] };
  },
};
