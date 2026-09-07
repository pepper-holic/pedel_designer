import { PAF_STYLE_HUMBUCKER, VINTAGE_SINGLE_COIL } from "../../core/library/deviceModels";
import type { WiringPreset } from "./types";

/**
 * Six tone caps on a rotary, plus a bypass detent. A rotary is the plain 1-of-N switch a blade
 * selector is not: exactly one contact is closed at a time, with no bridging between neighbours.
 *
 * Position 6 goes nowhere on purpose - it leaves the tone circuit open, which is the no-load
 * setting where the tone pot stops loading the pickup at all.
 */
export const rotaryToneCapSelector: WiringPreset = {
  id: "wiring-rotary-tone-caps",
  name: "로터리 톤 캡 셀렉터 (6단)",
  description:
    "톤 캡 5종을 6단 로터리로 전환하고 마지막 단은 톤 회로를 끊는(노로드) 구성. 캡 값이 커질수록 톤을 내렸을 때 더 낮은 대역까지 깎입니다.",
  category: "톤 회로",
  outputTerminal: { partId: "VOL", terminalId: "wiper" },
  snapshot: {
    blocks: [],
    parts: [
      { id: "PU1", type: "pickup", x: 140, y: 230, rotation: 0, params: { ...PAF_STYLE_HUMBUCKER } },
      { id: "VOL", type: "potentiometer", x: 340, y: 230, rotation: 0, params: { resistance: 500_000, position: 1, taper: "A" } },
      { id: "TONE", type: "potentiometer", x: 340, y: 400, rotation: 0, params: { resistance: 500_000, position: 0.3, taper: "A" } },
      { id: "SEL_CAP", type: "rotary6", x: 500, y: 400, rotation: 0, params: { switchPosition: 2 } },
      { id: "C1", type: "capacitor", x: 650, y: 300, rotation: 0, params: { capacitance: 3.3e-9 } },
      { id: "C2", type: "capacitor", x: 650, y: 360, rotation: 0, params: { capacitance: 10e-9 } },
      { id: "C3", type: "capacitor", x: 650, y: 420, rotation: 0, params: { capacitance: 22e-9 } },
      { id: "C4", type: "capacitor", x: 650, y: 480, rotation: 0, params: { capacitance: 47e-9 } },
      { id: "C5", type: "capacitor", x: 650, y: 540, rotation: 0, params: { capacitance: 100e-9 } },
      { id: "Rload", type: "resistor", x: 560, y: 140, rotation: 0, params: { resistance: 1_000_000 } },
      { id: "G1", type: "ground", x: 110, y: 310, rotation: 0, params: {} },
      { id: "G2", type: "ground", x: 310, y: 310, rotation: 0, params: {} },
      { id: "G3", type: "ground", x: 780, y: 440, rotation: 0, params: {} },
      { id: "G4", type: "ground", x: 590, y: 220, rotation: 0, params: {} },
    ],
    wires: [
      { id: "wr1", a: { partId: "PU1", terminalId: "gnd" }, b: { partId: "G1", terminalId: "gnd" } },
      { id: "wr2", a: { partId: "PU1", terminalId: "hot" }, b: { partId: "VOL", terminalId: "b" } },
      { id: "wr3", a: { partId: "VOL", terminalId: "a" }, b: { partId: "G2", terminalId: "gnd" } },
      { id: "wr4", a: { partId: "VOL", terminalId: "wiper" }, b: { partId: "Rload", terminalId: "a" } },
      { id: "wr5", a: { partId: "Rload", terminalId: "b" }, b: { partId: "G4", terminalId: "gnd" } },
      { id: "wr6", a: { partId: "VOL", terminalId: "b" }, b: { partId: "TONE", terminalId: "a" } },
      { id: "wr7", a: { partId: "TONE", terminalId: "wiper" }, b: { partId: "SEL_CAP", terminalId: "common" } },
      { id: "wr8", a: { partId: "SEL_CAP", terminalId: "in1" }, b: { partId: "C1", terminalId: "a" } },
      { id: "wr9", a: { partId: "SEL_CAP", terminalId: "in2" }, b: { partId: "C2", terminalId: "a" } },
      { id: "wr10", a: { partId: "SEL_CAP", terminalId: "in3" }, b: { partId: "C3", terminalId: "a" } },
      { id: "wr11", a: { partId: "SEL_CAP", terminalId: "in4" }, b: { partId: "C4", terminalId: "a" } },
      { id: "wr12", a: { partId: "SEL_CAP", terminalId: "in5" }, b: { partId: "C5", terminalId: "a" } },
      { id: "wr13", a: { partId: "C1", terminalId: "b" }, b: { partId: "G3", terminalId: "gnd" } },
      { id: "wr14", a: { partId: "C2", terminalId: "b" }, b: { partId: "G3", terminalId: "gnd" } },
      { id: "wr15", a: { partId: "C3", terminalId: "b" }, b: { partId: "G3", terminalId: "gnd" } },
      { id: "wr16", a: { partId: "C4", terminalId: "b" }, b: { partId: "G3", terminalId: "gnd" } },
      { id: "wr17", a: { partId: "C5", terminalId: "b" }, b: { partId: "G3", terminalId: "gnd" } },
    ],
  },
  archive: {
    sourceRefs: [{ label: "로터리 톤 캡 선택 모드의 공개된 구성 (DIY 커뮤니티 문서)", url: "https://www.guitarnuts.com/wiring/" }],
    disclaimer: "표준 모드 구성의 재구성이며 특정 제조사 배선도를 복제한 것이 아닙니다. 캡 값은 흔히 쓰이는 대표값입니다.",
  },
};

/**
 * Two things a plain SPST does in a guitar, on one canvas:
 * - `SW_KILL` shorts the output straight to ground, which is the kill switch.
 * - `SW_NOLOAD` sits between the tone pot's wiper and its cap. Opening it lifts the whole tone
 *   circuit off the pickup, which is what a no-load tone pot does at its last detent - the pot
 *   stops loading the pickup even at a nominal "10" setting.
 */
export const killSwitchAndNoLoadTone: WiringPreset = {
  id: "wiring-kill-switch-noload-tone",
  name: "킬 스위치 + 노로드 톤 (SPST 응용)",
  description:
    "출력을 접지로 단락시키는 킬 스위치와, 톤 회로 자체를 끊어 픽업 로딩을 없애는 노로드 톤 스위치. 둘 다 SPST 하나로 만들어집니다.",
  category: "톤 회로",
  outputTerminal: { partId: "VOL", terminalId: "wiper" },
  snapshot: {
    blocks: [],
    parts: [
      { id: "PU1", type: "pickup", x: 140, y: 220, rotation: 0, params: { ...VINTAGE_SINGLE_COIL } },
      { id: "VOL", type: "potentiometer", x: 340, y: 220, rotation: 0, params: { resistance: 250_000, position: 1, taper: "A" } },
      { id: "TONE", type: "potentiometer", x: 340, y: 390, rotation: 0, params: { resistance: 250_000, position: 1, taper: "A" } },
      { id: "SW_NOLOAD", type: "spst", x: 490, y: 390, rotation: 0, params: { switchPosition: 1 } },
      { id: "Ctone", type: "capacitor", x: 620, y: 390, rotation: 0, params: { capacitance: 22e-9 } },
      { id: "SW_KILL", type: "spst", x: 500, y: 300, rotation: 0, params: { switchPosition: 0 } },
      { id: "Rload", type: "resistor", x: 620, y: 140, rotation: 0, params: { resistance: 1_000_000 } },
      { id: "G1", type: "ground", x: 110, y: 300, rotation: 0, params: {} },
      { id: "G2", type: "ground", x: 310, y: 300, rotation: 0, params: {} },
      { id: "G3", type: "ground", x: 650, y: 470, rotation: 0, params: {} },
      { id: "G4", type: "ground", x: 560, y: 310, rotation: 0, params: {} },
      { id: "G5", type: "ground", x: 650, y: 220, rotation: 0, params: {} },
    ],
    wires: [
      { id: "wk1", a: { partId: "PU1", terminalId: "gnd" }, b: { partId: "G1", terminalId: "gnd" } },
      { id: "wk2", a: { partId: "PU1", terminalId: "hot" }, b: { partId: "VOL", terminalId: "b" } },
      { id: "wk3", a: { partId: "VOL", terminalId: "a" }, b: { partId: "G2", terminalId: "gnd" } },
      { id: "wk4", a: { partId: "VOL", terminalId: "b" }, b: { partId: "TONE", terminalId: "a" } },
      { id: "wk5", a: { partId: "TONE", terminalId: "wiper" }, b: { partId: "SW_NOLOAD", terminalId: "a" } },
      { id: "wk6", a: { partId: "SW_NOLOAD", terminalId: "b" }, b: { partId: "Ctone", terminalId: "a" } },
      { id: "wk7", a: { partId: "Ctone", terminalId: "b" }, b: { partId: "G3", terminalId: "gnd" } },
      { id: "wk8", a: { partId: "VOL", terminalId: "wiper" }, b: { partId: "SW_KILL", terminalId: "a" } },
      { id: "wk9", a: { partId: "SW_KILL", terminalId: "b" }, b: { partId: "G4", terminalId: "gnd" } },
      { id: "wk10", a: { partId: "VOL", terminalId: "wiper" }, b: { partId: "Rload", terminalId: "a" } },
      { id: "wk11", a: { partId: "Rload", terminalId: "b" }, b: { partId: "G5", terminalId: "gnd" } },
    ],
  },
  archive: {
    sourceRefs: [{ label: "킬 스위치 / 노로드 톤 모드의 공개된 구성 (DIY 커뮤니티 문서)", url: "https://www.guitarnuts.com/wiring/" }],
    disclaimer: "표준 모드 구성의 재구성이며 특정 제조사 배선도를 복제한 것이 아닙니다.",
  },
};
