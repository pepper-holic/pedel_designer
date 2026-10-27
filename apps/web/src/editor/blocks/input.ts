import { BJT_2N5088, JFET_J201 } from "../../core/library/deviceModels";
import { IN_OUT, IN_OUT_SUPPLY, type BlockDef } from "./types";

/** Pull-down + coupling cap: stops the switch pop and blocks any DC the guitar side carries. */
export const inputCouplingBlock: BlockDef = {
  id: "input-coupling",
  label: "입력 커플링 (캡 + 풀다운)",
  category: "input",
  description: "1MΩ 풀다운과 100nF 커플링 캡 - 바이패스 스위칭 팝을 막고 DC를 차단하는 표준 입력부",
  ports: IN_OUT,
  build: () => ({
    elements: [
      { id: "Rpd", type: "resistor", nodes: ["in", "0"], resistance: 1_000_000 },
      { id: "Cin", type: "capacitor", nodes: ["in", "out"], capacitance: 100e-9 },
      { id: "Rbias", type: "resistor", nodes: ["out", "0"], resistance: 1_000_000 },
    ],
  }),
};

/** Emitter follower biased at half supply: ~1MΩ/2 input impedance, a few hundred ohms out. */
export const inputBufferBjtBlock: BlockDef = {
  id: "input-buffer-bjt",
  label: "입력 버퍼 (BJT 이미터 팔로워)",
  category: "input",
  description: "2N5088 이미터 팔로워 - 높은 입력 임피던스로 픽업을 덜 누르고, 낮은 출력 임피던스로 다음 단을 구동",
  ports: IN_OUT_SUPPLY,
  build: () => ({
    elements: [
      { id: "Cin", type: "capacitor", nodes: ["in", "b"], capacitance: 100e-9 },
      { id: "Rb1", type: "resistor", nodes: ["vcc", "b"], resistance: 1_000_000 },
      { id: "Rb2", type: "resistor", nodes: ["b", "0"], resistance: 1_000_000 },
      { id: "Q1", type: "bjt", nodes: ["b", "vcc", "e"], ...BJT_2N5088, polarity: "npn" },
      { id: "Re", type: "resistor", nodes: ["e", "0"], resistance: 10_000 },
      { id: "Cout", type: "capacitor", nodes: ["e", "out"], capacitance: 1e-6 },
      { id: "Rpd", type: "resistor", nodes: ["out", "0"], resistance: 100_000 },
    ],
  }),
};

/** JFET source follower with a divider-biased gate - the classic "transparent" JFET buffer. */
export const inputBufferJfetBlock: BlockDef = {
  id: "input-buffer-jfet",
  label: "입력 버퍼 (JFET 소스 팔로워)",
  category: "input",
  description: "J201 소스 팔로워, 게이트를 4.5V로 바이어스 - 매우 높은 입력 임피던스의 투명한 버퍼",
  ports: IN_OUT_SUPPLY,
  build: () => ({
    elements: [
      { id: "Cin", type: "capacitor", nodes: ["in", "g"], capacitance: 100e-9 },
      { id: "Rg1", type: "resistor", nodes: ["vcc", "g"], resistance: 1_000_000 },
      { id: "Rg2", type: "resistor", nodes: ["g", "0"], resistance: 1_000_000 },
      { id: "Q1", type: "jfet", nodes: ["g", "vcc", "s"], ...JFET_J201 },
      { id: "Rs", type: "resistor", nodes: ["s", "0"], resistance: 10_000 },
      { id: "Cout", type: "capacitor", nodes: ["s", "out"], capacitance: 1e-6 },
      { id: "Rpd", type: "resistor", nodes: ["out", "0"], resistance: 100_000 },
    ],
  }),
};

export const INPUT_BLOCKS = [inputCouplingBlock, inputBufferBjtBlock, inputBufferJfetBlock];
