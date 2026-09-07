import { PAF_STYLE_HUMBUCKER } from "../../core/library/deviceModels";
import type { PartInstance, Wire } from "../types";
import type { WiringPreset } from "./types";

/**
 * The 50s-vs-modern argument, reduced to the one thing that actually differs: which side of the
 * volume pot the tone circuit hangs off.
 *
 * - Modern: the tone pot is fed from the volume pot's input lug, so it loads the pickup by the same
 *   amount no matter where the volume knob sits.
 * - 50s: the tone pot is fed from the wiper instead, so it sits after the attenuation and follows
 *   the volume down with the rest of the signal.
 *
 * Everything else - pickup, pot values, cap, cable and amp load - is identical between the two, so
 * loading one after the other compares exactly that one wire.
 */

const TONE_CAP_F = 22e-9;
/** Both presets ship with the volume rolled back, because at full volume the two wirings are the
 * same circuit - the difference only exists while the pot is actually attenuating. */
const ROLLED_BACK_VOLUME = 0.4;

function sharedParts(): PartInstance[] {
  return [
    { id: "PU1", type: "pickup", x: 140, y: 220, rotation: 0, params: { ...PAF_STYLE_HUMBUCKER } },
    { id: "VOL", type: "potentiometer", x: 350, y: 220, rotation: 0, params: { resistance: 500_000, position: ROLLED_BACK_VOLUME, taper: "A" } },
    { id: "TONE", type: "potentiometer", x: 350, y: 390, rotation: 0, params: { resistance: 500_000, position: 1, taper: "A" } },
    { id: "Ctone", type: "capacitor", x: 500, y: 390, rotation: 0, params: { capacitance: TONE_CAP_F } },
    { id: "Ccable", type: "capacitor", x: 560, y: 300, rotation: 0, params: { capacitance: 470e-12 } },
    { id: "Rload", type: "resistor", x: 560, y: 140, rotation: 0, params: { resistance: 1_000_000 } },
    { id: "G1", type: "ground", x: 110, y: 300, rotation: 0, params: {} },
    { id: "G2", type: "ground", x: 320, y: 300, rotation: 0, params: {} },
    { id: "G3", type: "ground", x: 530, y: 470, rotation: 0, params: {} },
    { id: "G4", type: "ground", x: 590, y: 380, rotation: 0, params: {} },
    { id: "G5", type: "ground", x: 590, y: 220, rotation: 0, params: {} },
  ];
}

function sharedWires(): Wire[] {
  return [
    { id: "wv1", a: { partId: "PU1", terminalId: "gnd" }, b: { partId: "G1", terminalId: "gnd" } },
    { id: "wv2", a: { partId: "PU1", terminalId: "hot" }, b: { partId: "VOL", terminalId: "b" } },
    { id: "wv3", a: { partId: "VOL", terminalId: "a" }, b: { partId: "G2", terminalId: "gnd" } },
    { id: "wv4", a: { partId: "TONE", terminalId: "wiper" }, b: { partId: "Ctone", terminalId: "a" } },
    { id: "wv5", a: { partId: "Ctone", terminalId: "b" }, b: { partId: "G3", terminalId: "gnd" } },
    { id: "wv6", a: { partId: "VOL", terminalId: "wiper" }, b: { partId: "Ccable", terminalId: "a" } },
    { id: "wv7", a: { partId: "Ccable", terminalId: "b" }, b: { partId: "G4", terminalId: "gnd" } },
    { id: "wv8", a: { partId: "VOL", terminalId: "wiper" }, b: { partId: "Rload", terminalId: "a" } },
    { id: "wv9", a: { partId: "Rload", terminalId: "b" }, b: { partId: "G5", terminalId: "gnd" } },
  ];
}

function wiringVariant(id: string, name: string, description: string, toneFeedTerminal: "b" | "wiper"): WiringPreset {
  return {
    id,
    name,
    description,
    category: "톤 회로",
    outputTerminal: { partId: "VOL", terminalId: "wiper" },
    snapshot: {
      blocks: [],
      parts: sharedParts(),
      wires: [
        ...sharedWires(),
        // The one wire that differs between the two wirings.
        { id: "wvTone", a: { partId: "VOL", terminalId: toneFeedTerminal }, b: { partId: "TONE", terminalId: "a" } },
      ],
    },
    archive: {
      sourceRefs: [{ label: "50s / 모던 배선 차이에 대한 공개 자료 (DIY 커뮤니티 문서)", url: "https://www.guitarnuts.com/wiring/" }],
      disclaimer: "표준 배선 구성의 재구성이며 특정 제조사 배선도를 복제한 것이 아닙니다. 부품값은 흔히 쓰이는 대표값입니다.",
    },
  };
}

export const modernWiring = wiringVariant(
  "wiring-modern-tone-feed",
  "모던 배선 (톤을 볼륨 입력에서 받음)",
  "톤 포트를 볼륨 포트 입력 쪽에 연결한 일반적인 배선. 볼륨 위치와 무관하게 톤 회로가 픽업을 계속 로딩합니다.",
  "b",
);

export const fiftiesWiring = wiringVariant(
  "wiring-50s-tone-feed",
  "50s 배선 (톤을 볼륨 와이퍼에서 받음)",
  "톤 포트를 볼륨 와이퍼 쪽에 연결한 배선. 톤 회로가 감쇠 뒤에 놓여 볼륨을 내려도 고음이 덜 죽습니다.",
  "wiper",
);
