import { SILICON_DIODE_1N4148, GENERIC_SILICON_NPN } from "../core/library/deviceModels";

export type PartType = "resistor" | "capacitor" | "inductor" | "diode" | "bjt" | "opamp" | "vsource" | "ground" | "potentiometer";

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
    defaultParams: { ...SILICON_DIODE_1N4148 },
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
  opamp: {
    type: "opamp",
    label: "연산증폭기 (이상적)",
    terminals: [
      { id: "inPlus", dx: -35, dy: -15, label: "+" },
      { id: "inMinus", dx: -35, dy: 15, label: "-" },
      { id: "out", dx: 35, dy: 0, label: "out" },
    ],
    defaultParams: { openLoopGain: 1e5 },
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
