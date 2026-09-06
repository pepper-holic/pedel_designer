import { BRIDGE_SINGLE_COIL, VINTAGE_SINGLE_COIL, PAF_STYLE_HUMBUCKER } from "../../core/library/deviceModels";
import type { WiringPreset } from "./types";

/** Two pickups on a 3-way blade with one shared volume and tone - the middle detent bridges both
 * contacts, putting the pickups in parallel. */
export const teleStyleThreeWay: WiringPreset = {
  id: "wiring-tele-style-3way",
  name: "텔레 스타일 3-way (볼륨/톤 공유)",
  description: "싱글코일 2개 + 3-way 셀렉터, 마스터 볼륨/톤. 가운데 위치에서 두 픽업이 병렬로 붙습니다.",
  category: "셀렉터",
  outputTerminal: { partId: "VOL", terminalId: "wiper" },
  snapshot: {
    blocks: [],
    parts: [
      { id: "PU_BRIDGE", type: "pickup", x: 140, y: 160, rotation: 0, params: { ...BRIDGE_SINGLE_COIL } },
      { id: "PU_NECK", type: "pickup", x: 140, y: 320, rotation: 0, params: { ...VINTAGE_SINGLE_COIL } },
      { id: "SEL", type: "blade3", x: 330, y: 240, rotation: 0, params: { switchPosition: 0 } },
      { id: "VOL", type: "potentiometer", x: 500, y: 240, rotation: 0, params: { resistance: 250_000, position: 1, taper: "A" } },
      { id: "TONE", type: "potentiometer", x: 500, y: 410, rotation: 0, params: { resistance: 250_000, position: 1, taper: "A" } },
      { id: "Ctone", type: "capacitor", x: 650, y: 410, rotation: 0, params: { capacitance: 47e-9 } },
      { id: "Rload", type: "resistor", x: 670, y: 140, rotation: 0, params: { resistance: 1_000_000 } },
      { id: "G1", type: "ground", x: 110, y: 240, rotation: 0, params: {} },
      { id: "G2", type: "ground", x: 110, y: 400, rotation: 0, params: {} },
      { id: "G3", type: "ground", x: 470, y: 330, rotation: 0, params: {} },
      { id: "G4", type: "ground", x: 680, y: 490, rotation: 0, params: {} },
      { id: "G5", type: "ground", x: 700, y: 220, rotation: 0, params: {} },
    ],
    wires: [
      { id: "wt1", a: { partId: "PU_BRIDGE", terminalId: "gnd" }, b: { partId: "G1", terminalId: "gnd" } },
      { id: "wt2", a: { partId: "PU_NECK", terminalId: "gnd" }, b: { partId: "G2", terminalId: "gnd" } },
      { id: "wt3", a: { partId: "PU_BRIDGE", terminalId: "hot" }, b: { partId: "SEL", terminalId: "in1" } },
      { id: "wt4", a: { partId: "PU_NECK", terminalId: "hot" }, b: { partId: "SEL", terminalId: "in2" } },
      { id: "wt5", a: { partId: "SEL", terminalId: "common" }, b: { partId: "VOL", terminalId: "b" } },
      { id: "wt6", a: { partId: "VOL", terminalId: "a" }, b: { partId: "G3", terminalId: "gnd" } },
      { id: "wt7", a: { partId: "VOL", terminalId: "wiper" }, b: { partId: "Rload", terminalId: "a" } },
      { id: "wt8", a: { partId: "Rload", terminalId: "b" }, b: { partId: "G5", terminalId: "gnd" } },
      { id: "wt9", a: { partId: "VOL", terminalId: "wiper" }, b: { partId: "TONE", terminalId: "a" } },
      { id: "wt10", a: { partId: "TONE", terminalId: "wiper" }, b: { partId: "Ctone", terminalId: "a" } },
      { id: "wt11", a: { partId: "Ctone", terminalId: "b" }, b: { partId: "G4", terminalId: "gnd" } },
    ],
  },
  archive: {
    sourceRefs: [{ label: "2픽업 3-way 배선의 공개된 표준 구성 (DIY 커뮤니티 문서)", url: "https://www.guitarnuts.com/wiring/" }],
    disclaimer: "표준 배선 구성의 재구성이며 특정 제조사 배선도를 복제한 것이 아닙니다. 부품값은 계열 대표 근사값입니다.",
  },
};

/**
 * Two humbuckers, 3-way, and the independent volume/tone pair per pickup that goes with it. In the
 * middle position the two volume pots interact: turning one down loads the other as well, which is
 * the well-known quirk of this layout and the reason the 50s-vs-modern wiring argument exists.
 *
 * `SEL_OUT` stands in for the amp input load, and its "a" terminal is the output tap.
 */
export const lesPaulStyleThreeWay: WiringPreset = {
  id: "wiring-lespaul-style-3way",
  name: "레스폴 스타일 3-way (험버커 2개, 독립 볼륨/톤)",
  description:
    "험버커 2개 + 3-way 셀렉터, 픽업별 독립 볼륨과 톤. 가운데 위치에서는 한쪽 볼륨을 줄이면 다른 쪽 출력까지 함께 줄어드는 상호작용이 나타납니다.",
  category: "셀렉터",
  outputTerminal: { partId: "SEL_OUT", terminalId: "a" },
  snapshot: {
    blocks: [],
    parts: [
      { id: "PU_BRIDGE", type: "pickup", x: 140, y: 150, rotation: 0, params: { ...PAF_STYLE_HUMBUCKER } },
      { id: "PU_NECK", type: "pickup", x: 140, y: 430, rotation: 0, params: { ...PAF_STYLE_HUMBUCKER } },
      { id: "VOL_B", type: "potentiometer", x: 330, y: 150, rotation: 0, params: { resistance: 500_000, position: 1, taper: "A" } },
      { id: "TONE_B", type: "potentiometer", x: 330, y: 280, rotation: 0, params: { resistance: 500_000, position: 1, taper: "A" } },
      { id: "CT_B", type: "capacitor", x: 480, y: 280, rotation: 0, params: { capacitance: 22e-9 } },
      { id: "VOL_N", type: "potentiometer", x: 330, y: 430, rotation: 0, params: { resistance: 500_000, position: 1, taper: "A" } },
      { id: "TONE_N", type: "potentiometer", x: 330, y: 560, rotation: 0, params: { resistance: 500_000, position: 1, taper: "A" } },
      { id: "CT_N", type: "capacitor", x: 480, y: 560, rotation: 0, params: { capacitance: 22e-9 } },
      { id: "SEL", type: "blade3", x: 610, y: 290, rotation: 0, params: { switchPosition: 0 } },
      { id: "SEL_OUT", type: "resistor", x: 760, y: 290, rotation: 0, params: { resistance: 1_000_000 } },
      { id: "G1", type: "ground", x: 110, y: 230, rotation: 0, params: {} },
      { id: "G2", type: "ground", x: 110, y: 510, rotation: 0, params: {} },
      { id: "G3", type: "ground", x: 300, y: 230, rotation: 0, params: {} },
      { id: "G4", type: "ground", x: 300, y: 510, rotation: 0, params: {} },
      { id: "G5", type: "ground", x: 510, y: 360, rotation: 0, params: {} },
      { id: "G6", type: "ground", x: 510, y: 640, rotation: 0, params: {} },
      { id: "G7", type: "ground", x: 790, y: 370, rotation: 0, params: {} },
    ],
    wires: [
      { id: "wl1", a: { partId: "PU_BRIDGE", terminalId: "gnd" }, b: { partId: "G1", terminalId: "gnd" } },
      { id: "wl2", a: { partId: "PU_NECK", terminalId: "gnd" }, b: { partId: "G2", terminalId: "gnd" } },
      { id: "wl3", a: { partId: "PU_BRIDGE", terminalId: "hot" }, b: { partId: "VOL_B", terminalId: "b" } },
      { id: "wl4", a: { partId: "VOL_B", terminalId: "a" }, b: { partId: "G3", terminalId: "gnd" } },
      { id: "wl5", a: { partId: "PU_NECK", terminalId: "hot" }, b: { partId: "VOL_N", terminalId: "b" } },
      { id: "wl6", a: { partId: "VOL_N", terminalId: "a" }, b: { partId: "G4", terminalId: "gnd" } },
      { id: "wl7", a: { partId: "VOL_B", terminalId: "wiper" }, b: { partId: "TONE_B", terminalId: "a" } },
      { id: "wl8", a: { partId: "TONE_B", terminalId: "wiper" }, b: { partId: "CT_B", terminalId: "a" } },
      { id: "wl9", a: { partId: "CT_B", terminalId: "b" }, b: { partId: "G5", terminalId: "gnd" } },
      { id: "wl10", a: { partId: "VOL_N", terminalId: "wiper" }, b: { partId: "TONE_N", terminalId: "a" } },
      { id: "wl11", a: { partId: "TONE_N", terminalId: "wiper" }, b: { partId: "CT_N", terminalId: "a" } },
      { id: "wl12", a: { partId: "CT_N", terminalId: "b" }, b: { partId: "G6", terminalId: "gnd" } },
      { id: "wl13", a: { partId: "VOL_B", terminalId: "wiper" }, b: { partId: "SEL", terminalId: "in1" } },
      { id: "wl14", a: { partId: "VOL_N", terminalId: "wiper" }, b: { partId: "SEL", terminalId: "in2" } },
      { id: "wl15", a: { partId: "SEL", terminalId: "common" }, b: { partId: "SEL_OUT", terminalId: "a" } },
      { id: "wl16", a: { partId: "SEL_OUT", terminalId: "b" }, b: { partId: "G7", terminalId: "gnd" } },
    ],
  },
  archive: {
    sourceRefs: [{ label: "2험버커 독립 볼륨/톤 3-way 배선의 공개된 표준 구성", url: "https://www.guitarnuts.com/wiring/" }],
    disclaimer: "표준 배선 구성의 재구성이며 특정 제조사 배선도를 복제한 것이 아닙니다. 부품값은 계열 대표 근사값입니다.",
  },
};
