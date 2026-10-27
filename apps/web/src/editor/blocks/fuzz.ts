import { GENERIC_GERMANIUM_PNP, GENERIC_SILICON_NPN, SILICON_DIODE_1N4148 } from "../../core/library/deviceModels";
import { GROUND } from "../../core/solver/types";
import { IN_OUT, IN_OUT_SUPPLY, type BlockDef } from "./types";

/**
 * Fuzz Face core, same values as the fuzz-germanium preset. Germanium PNP runs positive-ground, so
 * it carries its own -9V rail rather than taking the shared +9V - a real build of this circuit uses
 * a separate supply (or a charge pump) for exactly that reason.
 */
export const fuzzFaceCoreBlock: BlockDef = {
  id: "fuzz-face-core",
  label: "퍼즈 코어 (2-TR 저마늄, Fuzz-Face 스타일)",
  category: "fuzz",
  description: "PNP 저마늄 2단 직결 피드백 퍼즈. 양극 접지라 자체 -9V 전원을 포함. 기타 볼륨에 반응하는 대표 회로",
  ports: IN_OUT,
  build: () => ({
    elements: [
      { id: "Vneg", type: "vsource", nodes: [GROUND, "vneg"], voltage: 9, role: "supply" },
      { id: "Cin", type: "capacitor", nodes: ["in", "b1"], capacitance: 2.2e-6 },
      { id: "Rfb", type: "resistor", nodes: ["outc", "b1"], resistance: 100_000 },
      { id: "Q1", type: "bjt", nodes: ["b1", "c1", "e1"], polarity: "pnp", ...GENERIC_GERMANIUM_PNP },
      { id: "Re1", type: "resistor", nodes: ["e1", GROUND], resistance: 470 },
      { id: "Rc1", type: "resistor", nodes: ["vneg", "c1"], resistance: 33_000 },
      { id: "Q2", type: "bjt", nodes: ["c1", "outc", "e2"], polarity: "pnp", ...GENERIC_GERMANIUM_PNP },
      { id: "Rc2", type: "resistor", nodes: ["vneg", "outc"], resistance: 8_200 },
      { id: "Re2", type: "resistor", nodes: ["e2", GROUND], resistance: 100 },
      { id: "Ce2", type: "capacitor", nodes: ["e2", GROUND], capacitance: 22e-6 },
      { id: "Cout", type: "capacitor", nodes: ["outc", "out"], capacitance: 1e-6 },
      { id: "Rpd", type: "resistor", nodes: ["out", GROUND], resistance: 1_000_000 },
    ],
  }),
};

/** One Big Muff gain/clip stage (same values as the big-muff preset's stages): collector diodes clip
 * a bypassed common-emitter stage. Chain two for the classic sustain. */
export const muffClipStageBlock: BlockDef = {
  id: "muff-clip-stage",
  label: "퍼즈 단 (Big Muff 스타일 증폭+클리핑)",
  category: "fuzz",
  description: "바이패스된 공통 이미터 증폭 + 컬렉터 다이오드 클리핑. 두 개를 이어 붙이면 Big Muff의 긴 서스테인. V+ 9V 필요",
  ports: IN_OUT_SUPPLY,
  build: () => ({
    elements: [
      { id: "Cin", type: "capacitor", nodes: ["in", "b"], capacitance: 1e-6 },
      { id: "Rb", type: "resistor", nodes: ["vcc", "b"], resistance: 1_800_000 },
      { id: "Q1", type: "bjt", nodes: ["b", "c", "e"], polarity: "npn", ...GENERIC_SILICON_NPN },
      { id: "Rc", type: "resistor", nodes: ["vcc", "c"], resistance: 10_000 },
      { id: "Re", type: "resistor", nodes: ["e", GROUND], resistance: 470 },
      { id: "Ce", type: "capacitor", nodes: ["e", GROUND], capacitance: 22e-6 },
      { id: "Da", type: "diode", nodes: ["c", GROUND], ...SILICON_DIODE_1N4148 },
      { id: "Db", type: "diode", nodes: [GROUND, "c"], ...SILICON_DIODE_1N4148 },
      { id: "Cout", type: "capacitor", nodes: ["c", "out"], capacitance: 1e-6 },
      { id: "Rpd", type: "resistor", nodes: ["out", GROUND], resistance: 1_000_000 },
    ],
  }),
};

export const FUZZ_BLOCKS = [fuzzFaceCoreBlock, muffClipStageBlock];
