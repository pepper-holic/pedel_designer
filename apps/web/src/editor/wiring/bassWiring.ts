import { JAZZ_BASS_SINGLE, P_BASS_SPLIT } from "../../core/library/deviceModels";
import type { WiringPreset } from "./types";

/**
 * Two single-coil bass pickups with a volume each and one shared tone - the layout where the two
 * volumes are the blend control. Because both wipers meet at the same output node, backing one off
 * loads the other as well: that interaction is the whole reason players learn to run both wide open
 * or one fully off.
 */
export const jazzBassTwoVolumes: WiringPreset = {
  id: "wiring-jazz-bass-two-volumes",
  name: "재즈베이스 스타일 (볼륨 2 + 마스터 톤)",
  description:
    "싱글 픽업 2개에 볼륨을 하나씩 두고 톤은 공유하는 배선. 두 볼륨이 같은 출력 노드에서 만나기 때문에 한쪽을 줄이면 다른 쪽 출력까지 함께 영향을 받습니다.",
  category: "베이스",
  outputTerminal: { partId: "OUT_TAP", terminalId: "a" },
  snapshot: {
    blocks: [],
    parts: [
      { id: "PU_NECK", type: "pickup", x: 140, y: 160, rotation: 0, params: { ...JAZZ_BASS_SINGLE } },
      { id: "PU_BRIDGE", type: "pickup", x: 140, y: 400, rotation: 0, params: { ...JAZZ_BASS_SINGLE } },
      { id: "VOL_N", type: "potentiometer", x: 340, y: 160, rotation: 0, params: { resistance: 250_000, position: 1, taper: "A" } },
      { id: "VOL_B", type: "potentiometer", x: 340, y: 400, rotation: 0, params: { resistance: 250_000, position: 1, taper: "A" } },
      { id: "TONE", type: "potentiometer", x: 540, y: 400, rotation: 0, params: { resistance: 250_000, position: 1, taper: "A" } },
      { id: "Ctone", type: "capacitor", x: 690, y: 400, rotation: 0, params: { capacitance: 47e-9 } },
      { id: "OUT_TAP", type: "resistor", x: 620, y: 250, rotation: 0, params: { resistance: 1_000_000 } },
      { id: "G1", type: "ground", x: 110, y: 240, rotation: 0, params: {} },
      { id: "G2", type: "ground", x: 110, y: 480, rotation: 0, params: {} },
      { id: "G3", type: "ground", x: 310, y: 240, rotation: 0, params: {} },
      { id: "G4", type: "ground", x: 310, y: 480, rotation: 0, params: {} },
      { id: "G5", type: "ground", x: 720, y: 480, rotation: 0, params: {} },
      { id: "G6", type: "ground", x: 650, y: 330, rotation: 0, params: {} },
    ],
    wires: [
      { id: "wj1", a: { partId: "PU_NECK", terminalId: "gnd" }, b: { partId: "G1", terminalId: "gnd" } },
      { id: "wj2", a: { partId: "PU_BRIDGE", terminalId: "gnd" }, b: { partId: "G2", terminalId: "gnd" } },
      { id: "wj3", a: { partId: "PU_NECK", terminalId: "hot" }, b: { partId: "VOL_N", terminalId: "b" } },
      { id: "wj4", a: { partId: "VOL_N", terminalId: "a" }, b: { partId: "G3", terminalId: "gnd" } },
      { id: "wj5", a: { partId: "PU_BRIDGE", terminalId: "hot" }, b: { partId: "VOL_B", terminalId: "b" } },
      { id: "wj6", a: { partId: "VOL_B", terminalId: "a" }, b: { partId: "G4", terminalId: "gnd" } },
      { id: "wj7", a: { partId: "VOL_N", terminalId: "wiper" }, b: { partId: "OUT_TAP", terminalId: "a" } },
      { id: "wj8", a: { partId: "VOL_B", terminalId: "wiper" }, b: { partId: "OUT_TAP", terminalId: "a" } },
      { id: "wj9", a: { partId: "OUT_TAP", terminalId: "b" }, b: { partId: "G6", terminalId: "gnd" } },
      { id: "wj10", a: { partId: "OUT_TAP", terminalId: "a" }, b: { partId: "TONE", terminalId: "a" } },
      { id: "wj11", a: { partId: "TONE", terminalId: "wiper" }, b: { partId: "Ctone", terminalId: "a" } },
      { id: "wj12", a: { partId: "Ctone", terminalId: "b" }, b: { partId: "G5", terminalId: "gnd" } },
    ],
  },
  archive: {
    sourceRefs: [{ label: "2픽업 베이스 볼륨/볼륨/톤 배선의 공개된 표준 구성", url: "https://www.guitarnuts.com/wiring/" }],
    disclaimer: "표준 배선 구성의 재구성이며 특정 제조사 배선도를 복제한 것이 아닙니다. 부품값은 계열 대표 근사값입니다.",
  },
};

/**
 * A split-coil and a single-coil bass pickup mixed by one blend pot instead of two volumes: the
 * pot's two ends take a pickup each and the wiper is the output, so turning it crossfades between
 * them and leaves the total load roughly constant.
 *
 * The two pickups have quite different impedances (a split coil is a lot more inductive than a jazz
 * single), which is why a blend never sits perfectly centred by ear even though the pot does.
 */
export const pjBlendWiring: WiringPreset = {
  id: "wiring-pj-blend",
  name: "P/J 블렌드 배선 (블렌드 포트)",
  description:
    "스플릿 코일과 싱글 픽업을 블렌드 포트 하나로 섞는 배선. 임피던스가 다른 두 픽업을 섞기 때문에 노브 가운데가 소리의 가운데와 일치하지 않습니다.",
  category: "베이스",
  outputTerminal: { partId: "VOL", terminalId: "wiper" },
  snapshot: {
    blocks: [],
    parts: [
      { id: "PU_P", type: "pickup", x: 140, y: 160, rotation: 0, params: { ...P_BASS_SPLIT } },
      { id: "PU_J", type: "pickup", x: 140, y: 400, rotation: 0, params: { ...JAZZ_BASS_SINGLE } },
      { id: "BLEND", type: "potentiometer", x: 350, y: 280, rotation: 0, params: { resistance: 250_000, position: 0.5, taper: "B" } },
      { id: "VOL", type: "potentiometer", x: 530, y: 200, rotation: 0, params: { resistance: 250_000, position: 1, taper: "A" } },
      { id: "TONE", type: "potentiometer", x: 530, y: 380, rotation: 0, params: { resistance: 250_000, position: 1, taper: "A" } },
      { id: "Ctone", type: "capacitor", x: 680, y: 380, rotation: 0, params: { capacitance: 47e-9 } },
      { id: "Rload", type: "resistor", x: 690, y: 120, rotation: 0, params: { resistance: 1_000_000 } },
      { id: "G1", type: "ground", x: 110, y: 240, rotation: 0, params: {} },
      { id: "G2", type: "ground", x: 110, y: 480, rotation: 0, params: {} },
      { id: "G3", type: "ground", x: 500, y: 290, rotation: 0, params: {} },
      { id: "G4", type: "ground", x: 710, y: 460, rotation: 0, params: {} },
      { id: "G5", type: "ground", x: 720, y: 200, rotation: 0, params: {} },
    ],
    wires: [
      { id: "wpj1", a: { partId: "PU_P", terminalId: "gnd" }, b: { partId: "G1", terminalId: "gnd" } },
      { id: "wpj2", a: { partId: "PU_J", terminalId: "gnd" }, b: { partId: "G2", terminalId: "gnd" } },
      // Each pickup takes one end of the blend pot; the wiper crossfades between them.
      { id: "wpj3", a: { partId: "PU_P", terminalId: "hot" }, b: { partId: "BLEND", terminalId: "a" } },
      { id: "wpj4", a: { partId: "PU_J", terminalId: "hot" }, b: { partId: "BLEND", terminalId: "b" } },
      { id: "wpj5", a: { partId: "BLEND", terminalId: "wiper" }, b: { partId: "VOL", terminalId: "b" } },
      { id: "wpj6", a: { partId: "VOL", terminalId: "a" }, b: { partId: "G3", terminalId: "gnd" } },
      { id: "wpj7", a: { partId: "VOL", terminalId: "wiper" }, b: { partId: "Rload", terminalId: "a" } },
      { id: "wpj8", a: { partId: "Rload", terminalId: "b" }, b: { partId: "G5", terminalId: "gnd" } },
      { id: "wpj9", a: { partId: "VOL", terminalId: "wiper" }, b: { partId: "TONE", terminalId: "a" } },
      { id: "wpj10", a: { partId: "TONE", terminalId: "wiper" }, b: { partId: "Ctone", terminalId: "a" } },
      { id: "wpj11", a: { partId: "Ctone", terminalId: "b" }, b: { partId: "G4", terminalId: "gnd" } },
    ],
  },
  archive: {
    sourceRefs: [{ label: "P/J 블렌드 포트 배선의 공개된 구성 (DIY 커뮤니티 문서)", url: "https://www.guitarnuts.com/wiring/" }],
    disclaimer: "표준 배선 구성의 재구성이며 특정 제조사 배선도를 복제한 것이 아닙니다. 부품값은 계열 대표 근사값입니다.",
  },
};
