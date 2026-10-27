import { GERMANIUM_DIODE, JRC4558_APPROX, RED_LED, SILICON_DIODE_1N4148 } from "../../core/library/deviceModels";
import { GROUND } from "../../core/solver/types";
import type { Netlist } from "../../core/solver/types";
import { IN_OUT, type BlockDef } from "./types";

type DiodeParams = typeof SILICON_DIODE_1N4148;

/** Series resistor into an antiparallel diode pair to ground - the shunt (hard) clipper. */
function shuntClipper(seriesOhms: number, d1: DiodeParams, d2: DiodeParams): () => Netlist {
  return () => ({
    elements: [
      { id: "R1", type: "resistor", nodes: ["in", "out"], resistance: seriesOhms },
      { id: "D1", type: "diode", nodes: ["out", GROUND], ...d1 },
      { id: "D2", type: "diode", nodes: [GROUND, "out"], ...d2 },
    ],
  });
}

export const clipperSymmetricBlock: BlockDef = {
  id: "clipper-symmetric",
  label: "클리핑 단 (대칭 실리콘)",
  category: "clipping",
  description: "저항 + 대칭 실리콘 다이오드 페어 - 약 ±0.6V에서 자르는 하드 클리핑 (RAT·Distortion+ 계열)",
  ports: IN_OUT,
  build: shuntClipper(10_000, SILICON_DIODE_1N4148, SILICON_DIODE_1N4148),
};

export const clipperAsymmetricBlock: BlockDef = {
  id: "clipper-asymmetric",
  label: "클리핑 단 (비대칭: 실리콘+LED)",
  category: "clipping",
  description: "저항 + 비대칭 다이오드 페어(실리콘/LED) - 짝수 배음이 강한 비대칭 클리핑",
  ports: IN_OUT,
  build: shuntClipper(10_000, SILICON_DIODE_1N4148, RED_LED),
};

export const clipperGermaniumBlock: BlockDef = {
  id: "clipper-germanium",
  label: "클리핑 단 (게르마늄)",
  category: "clipping",
  description: "1N34A 게르마늄 페어 - 약 ±0.3V부터 둥글게 눌리는 소프트 클리핑, 출력이 작다",
  ports: IN_OUT,
  build: shuntClipper(1_000, GERMANIUM_DIODE, GERMANIUM_DIODE),
};

export const clipperLedBlock: BlockDef = {
  id: "clipper-led",
  label: "클리핑 단 (LED)",
  category: "clipping",
  description: "적색 LED 페어 - 약 ±1.7V까지 열려 있어 더 크고 개방적인 클리핑",
  ports: IN_OUT,
  build: shuntClipper(1_000, RED_LED, RED_LED),
};

/** TS-style: diodes in the op-amp feedback loop, so the clipping is soft and level-dependent. */
export const driveFeedbackClipperBlock: BlockDef = {
  id: "drive-feedback-clipper",
  label: "드라이브 단 (피드백 다이오드, TS 스타일)",
  category: "clipping",
  description: "논인버팅 증폭 + 피드백 루프 안의 실리콘 다이오드 페어 - 부드러운 오버드라이브. DRIVE 노브",
  ports: IN_OUT,
  knobs: [{ kind: "rheostat", id: "DRIVE", label: "DRIVE", element: "Rdrive", maxResistance: 500_000, taper: "A" }],
  build: () => ({
    elements: [
      { id: "U1", type: "opamp", nodes: ["in", "vminus", "out"], openLoopGain: 1e5, ...JRC4558_APPROX },
      { id: "Rg", type: "resistor", nodes: ["vminus", "ng"], resistance: 4_700 },
      { id: "Cg", type: "capacitor", nodes: ["ng", GROUND], capacitance: 47e-9 },
      { id: "Rf1", type: "resistor", nodes: ["vminus", "nf"], resistance: 51_000 },
      { id: "Rdrive", type: "resistor", nodes: ["nf", "out"], resistance: 50_000 },
      { id: "Cf", type: "capacitor", nodes: ["vminus", "out"], capacitance: 51e-12 },
      { id: "D1", type: "diode", nodes: ["vminus", "out"], ...SILICON_DIODE_1N4148 },
      { id: "D2", type: "diode", nodes: ["out", "vminus"], ...SILICON_DIODE_1N4148 },
    ],
  }),
};

export const CLIPPING_BLOCKS = [clipperSymmetricBlock, clipperAsymmetricBlock, clipperGermaniumBlock, clipperLedBlock, driveFeedbackClipperBlock];
