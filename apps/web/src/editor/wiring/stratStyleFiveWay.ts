import { VINTAGE_SINGLE_COIL, BRIDGE_SINGLE_COIL, HOT_SINGLE_COIL } from "../../core/library/deviceModels";
import type { WiringPreset } from "./types";

/**
 * Three single coils on a 5-way blade, master volume, and the two tone pots on the neck and middle
 * pickups. The in-between detents (positions 2 and 4) are the blade bridging two contacts, so those
 * pickups end up in parallel - lower total inductance and a noticeably thinner, quackier voice.
 *
 * Simplification: a real 5-way is two poles, the second of which routes the tone pots. Here the
 * tone pots hang directly off the neck and middle hot leads instead. An unselected pickup is
 * disconnected from the output, so its tone pot loads nothing audible - the selected positions
 * behave the same, with one part instead of a second ganged pole.
 */
export const stratStyleFiveWay: WiringPreset = {
  id: "wiring-strat-style-5way",
  name: "스트랫 스타일 5-way (싱글 3개)",
  description:
    "싱글코일 3개 + 5-way 블레이드 셀렉터, 마스터 볼륨, 넥/미들 톤. 2번과 4번 위치는 픽업 2개가 병렬로 붙어 공진이 올라갑니다.",
  category: "셀렉터",
  outputTerminal: { partId: "VOL", terminalId: "wiper" },
  snapshot: {
    blocks: [],
    parts: [
      { id: "PU_BRIDGE", type: "pickup", x: 140, y: 120, rotation: 0, params: { ...BRIDGE_SINGLE_COIL } },
      { id: "PU_MIDDLE", type: "pickup", x: 140, y: 260, rotation: 0, params: { ...HOT_SINGLE_COIL } },
      { id: "PU_NECK", type: "pickup", x: 140, y: 400, rotation: 0, params: { ...VINTAGE_SINGLE_COIL } },
      { id: "SEL", type: "blade5", x: 340, y: 260, rotation: 0, params: { switchPosition: 0 } },
      { id: "VOL", type: "potentiometer", x: 520, y: 260, rotation: 0, params: { resistance: 250_000, position: 1, taper: "A" } },
      { id: "TONE_MID", type: "potentiometer", x: 300, y: 550, rotation: 0, params: { resistance: 250_000, position: 1, taper: "A" } },
      { id: "CT_MID", type: "capacitor", x: 450, y: 550, rotation: 0, params: { capacitance: 22e-9 } },
      { id: "TONE_NECK", type: "potentiometer", x: 300, y: 670, rotation: 0, params: { resistance: 250_000, position: 1, taper: "A" } },
      { id: "CT_NECK", type: "capacitor", x: 450, y: 670, rotation: 0, params: { capacitance: 22e-9 } },
      { id: "Rload", type: "resistor", x: 680, y: 160, rotation: 0, params: { resistance: 1_000_000 } },
      { id: "G1", type: "ground", x: 110, y: 200, rotation: 0, params: {} },
      { id: "G2", type: "ground", x: 110, y: 340, rotation: 0, params: {} },
      { id: "G3", type: "ground", x: 110, y: 480, rotation: 0, params: {} },
      { id: "G4", type: "ground", x: 490, y: 350, rotation: 0, params: {} },
      { id: "G5", type: "ground", x: 480, y: 630, rotation: 0, params: {} },
      { id: "G6", type: "ground", x: 480, y: 750, rotation: 0, params: {} },
      { id: "G7", type: "ground", x: 710, y: 240, rotation: 0, params: {} },
    ],
    wires: [
      { id: "wf1", a: { partId: "PU_BRIDGE", terminalId: "gnd" }, b: { partId: "G1", terminalId: "gnd" } },
      { id: "wf2", a: { partId: "PU_MIDDLE", terminalId: "gnd" }, b: { partId: "G2", terminalId: "gnd" } },
      { id: "wf3", a: { partId: "PU_NECK", terminalId: "gnd" }, b: { partId: "G3", terminalId: "gnd" } },
      { id: "wf4", a: { partId: "PU_BRIDGE", terminalId: "hot" }, b: { partId: "SEL", terminalId: "in1" } },
      { id: "wf5", a: { partId: "PU_MIDDLE", terminalId: "hot" }, b: { partId: "SEL", terminalId: "in2" } },
      { id: "wf6", a: { partId: "PU_NECK", terminalId: "hot" }, b: { partId: "SEL", terminalId: "in3" } },
      { id: "wf7", a: { partId: "SEL", terminalId: "common" }, b: { partId: "VOL", terminalId: "b" } },
      { id: "wf8", a: { partId: "VOL", terminalId: "a" }, b: { partId: "G4", terminalId: "gnd" } },
      { id: "wf9", a: { partId: "VOL", terminalId: "wiper" }, b: { partId: "Rload", terminalId: "a" } },
      { id: "wf10", a: { partId: "Rload", terminalId: "b" }, b: { partId: "G7", terminalId: "gnd" } },
      { id: "wf11", a: { partId: "PU_MIDDLE", terminalId: "hot" }, b: { partId: "TONE_MID", terminalId: "a" } },
      { id: "wf12", a: { partId: "TONE_MID", terminalId: "wiper" }, b: { partId: "CT_MID", terminalId: "a" } },
      { id: "wf13", a: { partId: "CT_MID", terminalId: "b" }, b: { partId: "G5", terminalId: "gnd" } },
      { id: "wf14", a: { partId: "PU_NECK", terminalId: "hot" }, b: { partId: "TONE_NECK", terminalId: "a" } },
      { id: "wf15", a: { partId: "TONE_NECK", terminalId: "wiper" }, b: { partId: "CT_NECK", terminalId: "a" } },
      { id: "wf16", a: { partId: "CT_NECK", terminalId: "b" }, b: { partId: "G6", terminalId: "gnd" } },
    ],
  },
  archive: {
    sourceRefs: [{ label: "3픽업 5-way 배선의 공개된 표준 구성 (DIY 커뮤니티 문서)", url: "https://www.guitarnuts.com/wiring/" }],
    disclaimer: "표준 배선 구성의 재구성이며 특정 제조사 배선도를 복제한 것이 아닙니다. 부품값은 계열 대표 근사값입니다.",
  },
};
