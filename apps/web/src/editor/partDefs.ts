import { SILICON_DIODE_1N4148, GENERIC_SILICON_NPN, GENERIC_NCHANNEL_JFET, VINTAGE_SINGLE_COIL } from "../core/library/deviceModels";

export type PartType = "resistor" | "capacitor" | "inductor" | "diode" | "bjt" | "jfet" | "opamp" | "vsource" | "ground" | "potentiometer" | "pickup" | "spst" | "spdt" | "dpdt" | "blade3" | "blade5" | "rotary6" | "coupledInductors";

export interface TerminalDef {
  id: string;
  dx: number;
  dy: number;
  label: string;
}

export interface PartDef {
  type: PartType;
  label: string;
  terminals: TerminalDef[];
  defaultParams: Record<string, number | string>;
}

/** A closed switch contact, in ohms. Not zero: an exact short would put a redundant row in the MNA
 * matrix, and a milliohm is already four orders of magnitude below anything else in a guitar circuit. */
export const SWITCH_ON_OHMS = 1e-3;
/** An open switch contact, in ohms. Large enough to be an open circuit next to megohm-scale pots,
 * small enough to keep the matrix well conditioned. */
export const SWITCH_OFF_OHMS = 1e9;

export const PART_DEFS: Record<PartType, PartDef> = {
  resistor: {
    type: "resistor",
    label: "저항",
    terminals: [
      { id: "a", dx: -30, dy: 0, label: "a" },
      { id: "b", dx: 30, dy: 0, label: "b" },
    ],
    defaultParams: { resistance: 10_000 },
  },
  capacitor: {
    type: "capacitor",
    label: "커패시터",
    terminals: [
      { id: "a", dx: -30, dy: 0, label: "a" },
      { id: "b", dx: 30, dy: 0, label: "b" },
    ],
    defaultParams: { capacitance: 1e-6 },
  },
  inductor: {
    type: "inductor",
    label: "인덕터",
    terminals: [
      { id: "a", dx: -30, dy: 0, label: "a" },
      { id: "b", dx: 30, dy: 0, label: "b" },
    ],
    defaultParams: { inductance: 0.1 },
  },
  diode: {
    type: "diode",
    label: "다이오드 (1N4148)",
    terminals: [
      { id: "anode", dx: -30, dy: 0, label: "A" },
      { id: "cathode", dx: 30, dy: 0, label: "K" },
    ],
    defaultParams: { ...SILICON_DIODE_1N4148, seriesResistance: 0 },
  },
  bjt: {
    type: "bjt",
    label: "트랜지스터 (NPN)",
    terminals: [
      { id: "base", dx: -30, dy: 0, label: "B" },
      { id: "collector", dx: 20, dy: -30, label: "C" },
      { id: "emitter", dx: 20, dy: 30, label: "E" },
    ],
    defaultParams: { polarity: "npn", ...GENERIC_SILICON_NPN },
  },
  jfet: {
    type: "jfet",
    label: "JFET (N채널)",
    terminals: [
      { id: "gate", dx: -30, dy: 0, label: "G" },
      { id: "drain", dx: 20, dy: -30, label: "D" },
      { id: "source", dx: 20, dy: 30, label: "S" },
    ],
    defaultParams: { ...GENERIC_NCHANNEL_JFET },
  },
  opamp: {
    type: "opamp",
    label: "연산증폭기 (이상적)",
    terminals: [
      { id: "inPlus", dx: -35, dy: -15, label: "+" },
      { id: "inMinus", dx: -35, dy: 15, label: "-" },
      { id: "out", dx: 35, dy: 0, label: "out" },
    ],
    defaultParams: { openLoopGain: 1e5, gbwpHz: 0, slewRateVPerUs: 0, railPositive: 0, railNegative: 0 },
  },
  vsource: {
    type: "vsource",
    label: "전압원 (입력)",
    terminals: [
      { id: "positive", dx: 0, dy: -30, label: "+" },
      { id: "negative", dx: 0, dy: 30, label: "-" },
    ],
    defaultParams: { voltage: 0 },
  },
  ground: {
    type: "ground",
    label: "접지",
    terminals: [{ id: "gnd", dx: 0, dy: -20, label: "" }],
    defaultParams: {},
  },
  pickup: {
    type: "pickup",
    label: "픽업",
    terminals: [
      { id: "gnd", dx: -30, dy: 0, label: "G" },
      { id: "hot", dx: 30, dy: 0, label: "H" },
    ],
    defaultParams: { ...VINTAGE_SINGLE_COIL },
  },
  spst: {
    type: "spst",
    label: "스위치 (SPST, 1접점)",
    terminals: [
      { id: "a", dx: -30, dy: 0, label: "1" },
      { id: "b", dx: 30, dy: 0, label: "2" },
    ],
    defaultParams: { switchPosition: 0 },
  },
  spdt: {
    type: "spdt",
    label: "스위치 (SPDT, 3-way 토글)",
    terminals: [
      { id: "common", dx: -30, dy: 0, label: "C" },
      { id: "throwA", dx: 30, dy: -16, label: "1" },
      { id: "throwB", dx: 30, dy: 16, label: "2" },
    ],
    defaultParams: { switchPosition: 0 },
  },
  dpdt: {
    type: "dpdt",
    label: "스위치 (DPDT, 푸시풀/2단)",
    terminals: [
      { id: "common1", dx: -30, dy: -20, label: "C1" },
      { id: "pole1ThrowA", dx: 30, dy: -32, label: "1a" },
      { id: "pole1ThrowB", dx: 30, dy: -8, label: "1b" },
      { id: "common2", dx: -30, dy: 20, label: "C2" },
      { id: "pole2ThrowA", dx: 30, dy: 8, label: "2a" },
      { id: "pole2ThrowB", dx: 30, dy: 32, label: "2b" },
    ],
    defaultParams: { switchPosition: 0 },
  },
  blade3: {
    type: "blade3",
    label: "셀렉터 (3-way 블레이드)",
    terminals: [
      { id: "common", dx: -30, dy: 0, label: "C" },
      { id: "in1", dx: 30, dy: -18, label: "1" },
      { id: "in2", dx: 30, dy: 18, label: "2" },
    ],
    defaultParams: { switchPosition: 0 },
  },
  blade5: {
    type: "blade5",
    label: "셀렉터 (5-way 블레이드)",
    terminals: [
      { id: "common", dx: -30, dy: 0, label: "C" },
      { id: "in1", dx: 30, dy: -24, label: "1" },
      { id: "in2", dx: 30, dy: 0, label: "2" },
      { id: "in3", dx: 30, dy: 24, label: "3" },
    ],
    defaultParams: { switchPosition: 0 },
  },
  rotary6: {
    type: "rotary6",
    label: "로터리 스위치 (6단)",
    terminals: [
      { id: "common", dx: -30, dy: 0, label: "C" },
      { id: "in1", dx: 30, dy: -30, label: "1" },
      { id: "in2", dx: 30, dy: -18, label: "2" },
      { id: "in3", dx: 30, dy: -6, label: "3" },
      { id: "in4", dx: 30, dy: 6, label: "4" },
      { id: "in5", dx: 30, dy: 18, label: "5" },
      { id: "in6", dx: 30, dy: 30, label: "6" },
    ],
    defaultParams: { switchPosition: 0 },
  },
  coupledInductors: {
    type: "coupledInductors",
    label: "결합 인덕터 / 트랜스포머",
    terminals: [
      { id: "a1", dx: -30, dy: -20, label: "1a" },
      { id: "b1", dx: -30, dy: 20, label: "1b" },
      { id: "a2", dx: 30, dy: -20, label: "2a" },
      { id: "b2", dx: 30, dy: 20, label: "2b" },
    ],
    defaultParams: { inductanceA: 1, inductanceB: 1, coupling: 0.9 },
  },
  potentiometer: {
    type: "potentiometer",
    label: "포텐셔미터",
    terminals: [
      { id: "a", dx: -30, dy: 0, label: "a" },
      { id: "b", dx: 30, dy: 0, label: "b" },
      { id: "wiper", dx: 0, dy: -30, label: "w" },
    ],
    defaultParams: { resistance: 100_000, position: 0.5, taper: "B" },
  },
};
