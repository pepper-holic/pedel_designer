import type { BlockDef } from "./types";

/** 9V battery/adapter plus the 4.5V reference most op-amp pedals bias their signal around. The
 * reservoir caps are what a real board puts there; they make the rails quiet, not different. */
export const power9vBlock: BlockDef = {
  id: "power-9v",
  label: "9V 전원 + 4.5V 기준",
  category: "power",
  description: "9V 전원과 분압 4.5V 기준 전압(Vref). 트랜지스터·JFET 블록의 V+ 핀을 여기 9V 핀에 연결하세요.",
  ports: [
    { kind: "supply", node: "vcc", label: "9V" },
    { kind: "bias", node: "vref", label: "4.5V" },
  ],
  build: () => ({
    elements: [
      { id: "Vcc", type: "vsource", nodes: ["vcc", "0"], voltage: 9, role: "supply" },
      { id: "Cres", type: "capacitor", nodes: ["vcc", "0"], capacitance: 100e-6 },
      { id: "Rref1", type: "resistor", nodes: ["vcc", "vref"], resistance: 10_000 },
      { id: "Rref2", type: "resistor", nodes: ["vref", "0"], resistance: 10_000 },
      { id: "Cref", type: "capacitor", nodes: ["vref", "0"], capacitance: 47e-6 },
    ],
  }),
};

export const POWER_BLOCKS = [power9vBlock];
