import type { Netlist } from "../core/solver/types";
import { GROUND } from "../core/solver/types";
import { SILICON_DIODE_1N4148, RED_LED } from "../core/library/deviceModels";
import type { BlockCategory } from "./types";

export interface BlockDef {
  id: string;
  label: string;
  category: BlockCategory;
  description: string;
  defaultParams: Record<string, number>;
  /** Builds the block's internal sub-circuit. "in"/"out" (and any other node named here that no
   * other element in the block also uses) are left as free, unwired terminals once placed on the
   * canvas - the user wires those to whatever comes before/after by hand, same as any other part. */
  netlist: (params: Record<string, number>) => Netlist;
  layout?: Record<string, { x: number; y: number }>;
}

export const BLOCK_CATEGORY_LABELS: Record<BlockCategory, string> = {
  buffer: "버퍼",
  gain: "증폭 단",
  clipping: "클리핑 단",
  tone: "톤 스택",
  load: "부하",
};

/** Ideal op-amp voltage follower: high input impedance in, unity gain out - the classic
 * "isolate this stage from whatever's next" buffer (e.g. a pedal's input/output buffers). */
const bufferFollowerBlock: BlockDef = {
  id: "buffer-follower",
  label: "버퍼 (Op-Amp 팔로워)",
  category: "buffer",
  description: "이상적 연산증폭기 유닛 게인 팔로워 - 임피던스 분리, 게인 없음",
  defaultParams: {},
  netlist: () => ({
    elements: [{ id: "U1", type: "opamp", nodes: ["in", "out", "out"], openLoopGain: 1e5 }],
  }),
};

/** Inverting op-amp gain stage: gain = -Rf/Rin via the feedback resistor loop. Add it more than
 * once and wire each instance's "out" into the next one's "in" for a multi-stage amp chain. */
const gainStageInvertingBlock: BlockDef = {
  id: "gain-stage-inverting",
  label: "증폭 단 (인버팅 Op-Amp)",
  category: "gain",
  description: "저항 피드백 루프를 가진 인버팅 연산증폭기 게인 스테이지 - 게인 = -Rf/Rin, 여러 개 이어붙여 다단 구성 가능",
  defaultParams: { inputResistance: 10_000, feedbackResistance: 100_000 },
  netlist: (params) => ({
    elements: [
      { id: "Rin", type: "resistor", nodes: ["in", "vminus"], resistance: params.inputResistance },
      { id: "Rf", type: "resistor", nodes: ["vminus", "out"], resistance: params.feedbackResistance },
      { id: "U1", type: "opamp", nodes: [GROUND, "vminus", "out"], openLoopGain: 1e5 },
    ],
  }),
  layout: { Rin: { x: 100, y: 100 }, U1: { x: 260, y: 100 }, Rf: { x: 180, y: 20 } },
};

/** Series resistor into a symmetric antiparallel silicon diode pair to ground - a hard clipper
 * dropped in after a gain stage, same topology as the "다이오드 클리퍼" full-circuit preset. */
const clipperSymmetricBlock: BlockDef = {
  id: "clipper-symmetric",
  label: "클리핑 단 (대칭 실리콘)",
  category: "clipping",
  description: "저항 + 대칭 실리콘 다이오드 페어 - 하드 클리핑",
  defaultParams: { seriesResistance: 10_000 },
  netlist: (params) => ({
    elements: [
      { id: "R1", type: "resistor", nodes: ["in", "out"], resistance: params.seriesResistance },
      { id: "D1", type: "diode", nodes: ["out", GROUND], ...SILICON_DIODE_1N4148 },
      { id: "D2", type: "diode", nodes: [GROUND, "out"], ...SILICON_DIODE_1N4148 },
    ],
  }),
};

/** Same series-R clipper, but one leg is an LED instead of silicon - clips harder/earlier on one
 * half-cycle than the other for an asymmetric, even-harmonic-heavy overdrive character. */
const clipperAsymmetricBlock: BlockDef = {
  id: "clipper-asymmetric",
  label: "클리핑 단 (비대칭: 실리콘+LED)",
  category: "clipping",
  description: "저항 + 비대칭 다이오드 페어(실리콘/LED) - 짝수 배음이 강한 비대칭 클리핑",
  defaultParams: { seriesResistance: 10_000 },
  netlist: (params) => ({
    elements: [
      { id: "R1", type: "resistor", nodes: ["in", "out"], resistance: params.seriesResistance },
      { id: "D1", type: "diode", nodes: ["out", GROUND], ...SILICON_DIODE_1N4148 },
      { id: "D2", type: "diode", nodes: [GROUND, "out"], ...RED_LED },
    ],
  }),
};

/** Passive tone control: variable series resistance (the pot) into a fixed shunt capacitor to
 * ground - turning it down darkens the signal by pulling the RC low-pass corner down. */
const toneStackPassiveBlock: BlockDef = {
  id: "tone-stack-passive",
  label: "톤 스택 (패시브 필터)",
  category: "tone",
  description: "가변 직렬 저항(톤 노브) + 고정 션트 커패시터 - 저역통과 코너 주파수를 조절",
  defaultParams: { tone: 0.5, shuntCapacitance: 4.7e-9 },
  netlist: (params) => {
    const potTotal = 100_000;
    const minSeries = 50; // avoid a literal 0-ohm series leg at the pot's brightest extreme
    const seriesResistance = Math.max(potTotal * (1 - params.tone), minSeries);
    return {
      elements: [
        { id: "Rtone", type: "resistor", nodes: ["in", "out"], resistance: seriesResistance },
        { id: "Cshunt", type: "capacitor", nodes: ["out", GROUND], capacitance: params.shuntCapacitance },
      ],
    };
  },
};


/** Typical instrument-cable capacitance per metre. Real cables vary roughly 100-150 pF/m depending
 * on construction; this is a representative mid value, exposed through a length knob rather than a
 * raw picofarad figure because length is what a player actually changes. */
const CABLE_PF_PER_METER = 125;

/**
 * What a passive pickup actually drives: the cable's shunt capacitance plus the amp/pedal input
 * impedance. This pair is what moves a pickup's resonant peak around, so it is the other half of
 * any pickup experiment - see docs/plan-guitar-wiring.md §5. Wire "in" to the signal you want to
 * load (usually the pickup's hot lead).
 */
const cableAndAmpLoadBlock: BlockDef = {
  id: "cable-amp-load",
  label: "케이블 + 앰프 입력 부하",
  category: "load",
  description: "기타 케이블의 정전용량과 앰프 입력 임피던스 - 패시브 픽업의 공진 주파수와 고음을 좌우하는 부하",
  defaultParams: { cableLengthMeters: 3, ampInputResistance: 1_000_000 },
  netlist: (params) => ({
    elements: [
      { id: "Ccable", type: "capacitor", nodes: ["in", GROUND], capacitance: params.cableLengthMeters * CABLE_PF_PER_METER * 1e-12 },
      { id: "Rin", type: "resistor", nodes: ["in", GROUND], resistance: params.ampInputResistance },
    ],
  }),
  layout: { Ccable: { x: 100, y: 100 }, Rin: { x: 240, y: 100 } },
};

export const BLOCK_DEFS: BlockDef[] = [
  bufferFollowerBlock,
  gainStageInvertingBlock,
  clipperSymmetricBlock,
  clipperAsymmetricBlock,
  toneStackPassiveBlock,
  cableAndAmpLoadBlock,
];
