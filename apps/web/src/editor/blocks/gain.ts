import { GENERIC_SILICON_NPN, GENERIC_NCHANNEL_JFET, JRC4558_APPROX } from "../../core/library/deviceModels";
import { GROUND } from "../../core/solver/types";
import { IN_OUT, IN_OUT_SUPPLY, type BlockDef } from "./types";

/** Ideal op-amp voltage follower: high input impedance in, unity gain out. */
export const bufferFollowerBlock: BlockDef = {
  id: "buffer-follower",
  label: "버퍼 (Op-Amp 팔로워)",
  category: "buffer",
  description: "이상적 연산증폭기 유닛 게인 팔로워 - 임피던스 분리, 게인 없음",
  ports: IN_OUT,
  build: () => ({ elements: [{ id: "U1", type: "opamp", nodes: ["in", "out", "out"], openLoopGain: 1e5 }] }),
};

/** Inverting op-amp stage, gain = -Rf/Rin with Rf on a GAIN knob. */
export const gainStageInvertingBlock: BlockDef = {
  id: "gain-stage-inverting",
  label: "증폭 단 (인버팅 Op-Amp)",
  category: "gain",
  description: "인버팅 연산증폭기 - 게인 = -GAIN/10kΩ. GAIN 노브(최대 500kΩ)로 증폭량을 조절",
  ports: IN_OUT,
  knobs: [{ kind: "rheostat", id: "GAIN", label: "GAIN", element: "Rf", maxResistance: 500_000, taper: "A" }],
  build: () => ({
    elements: [
      { id: "Rin", type: "resistor", nodes: ["in", "vminus"], resistance: 10_000 },
      { id: "Rf", type: "resistor", nodes: ["vminus", "out"], resistance: 100_000 },
      { id: "U1", type: "opamp", nodes: [GROUND, "vminus", "out"], openLoopGain: 1e5 },
    ],
  }),
  layout: { Rin: { x: 100, y: 100 }, U1: { x: 260, y: 100 }, Rf: { x: 180, y: 20 } },
};

/** TS-style non-inverting stage without the diodes: gain = 1 + (51k + DRIVE)/4.7k above ~720Hz. */
export const gainOpampNonInvertingBlock: BlockDef = {
  id: "gain-opamp-noninverting",
  label: "증폭 단 (논인버팅 Op-Amp, 미드 험프)",
  category: "gain",
  description: "JRC4558 근사 논인버팅 증폭 - 4.7kΩ+47nF 접지 다리가 저음을 덜 증폭해 미드 험프를 만든다. DRIVE 노브",
  ports: IN_OUT,
  knobs: [{ kind: "rheostat", id: "DRIVE", label: "DRIVE", element: "Rdrive", maxResistance: 500_000, taper: "A" }],
  build: () => ({
    elements: [
      { id: "U1", type: "opamp", nodes: ["in", "vminus", "out"], openLoopGain: 1e5, ...JRC4558_APPROX },
      { id: "Rg", type: "resistor", nodes: ["vminus", "ng"], resistance: 4_700 },
      { id: "Cg", type: "capacitor", nodes: ["ng", GROUND], capacitance: 47e-9 },
      { id: "Rf1", type: "resistor", nodes: ["vminus", "nf"], resistance: 51_000 },
      { id: "Rdrive", type: "resistor", nodes: ["nf", "out"], resistance: 50_000 },
    ],
  }),
};

/** LPB-1 style common emitter: unbypassed emitter resistor fixes gain near Rc/Re. */
export const gainBjtCommonEmitterBlock: BlockDef = {
  id: "gain-bjt-ce",
  label: "증폭 단 (BJT 공통 이미터)",
  category: "gain",
  description: "LPB-1 스타일 단일 NPN 증폭 - 게인 ≈ Rc/Re(약 26배). V+ 핀에 9V 필요",
  ports: IN_OUT_SUPPLY,
  build: () => ({
    elements: [
      { id: "Cin", type: "capacitor", nodes: ["in", "b"], capacitance: 100e-9 },
      { id: "Rb1", type: "resistor", nodes: ["vcc", "b"], resistance: 430_000 },
      { id: "Rb2", type: "resistor", nodes: ["b", GROUND], resistance: 43_000 },
      { id: "Q1", type: "bjt", nodes: ["b", "c", "e"], polarity: "npn", ...GENERIC_SILICON_NPN },
      { id: "Rc", type: "resistor", nodes: ["vcc", "c"], resistance: 10_000 },
      { id: "Re", type: "resistor", nodes: ["e", GROUND], resistance: 390 },
      { id: "Cout", type: "capacitor", nodes: ["c", "out"], capacitance: 100e-9 },
      { id: "Rpd", type: "resistor", nodes: ["out", GROUND], resistance: 1_000_000 },
    ],
  }),
};

/** Self-biased JFET common source with a bypassed source resistor. */
export const gainJfetCommonSourceBlock: BlockDef = {
  id: "gain-jfet-cs",
  label: "증폭 단 (JFET 공통 소스)",
  category: "gain",
  description: "자기 바이어스 JFET 증폭 - 진공관처럼 부드럽게 포화되는 클린 부스트. V+ 핀에 9V 필요",
  ports: IN_OUT_SUPPLY,
  build: () => ({
    elements: [
      { id: "Cin", type: "capacitor", nodes: ["in", "g"], capacitance: 100e-9 },
      { id: "Rg", type: "resistor", nodes: ["g", GROUND], resistance: 1_000_000 },
      { id: "Q1", type: "jfet", nodes: ["g", "d", "s"], ...GENERIC_NCHANNEL_JFET },
      { id: "Rd", type: "resistor", nodes: ["vcc", "d"], resistance: 4_700 },
      { id: "Rs", type: "resistor", nodes: ["s", GROUND], resistance: 1_000 },
      { id: "Cs", type: "capacitor", nodes: ["s", GROUND], capacitance: 47e-6 },
      { id: "Cout", type: "capacitor", nodes: ["d", "out"], capacitance: 100e-9 },
      { id: "Rpd", type: "resistor", nodes: ["out", GROUND], resistance: 1_000_000 },
    ],
  }),
};

export const BUFFER_BLOCKS = [bufferFollowerBlock];
export const GAIN_BLOCKS = [gainStageInvertingBlock, gainOpampNonInvertingBlock, gainBjtCommonEmitterBlock, gainJfetCommonSourceBlock];
