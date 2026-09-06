import { VINTAGE_SINGLE_COIL } from "../../core/library/deviceModels";
import type { WiringPreset } from "./types";

/**
 * The simplest complete guitar circuit: one pickup, a volume pot, a tone pot with its cap, and the
 * amp load it drives. Everything else in this library is this plus switching.
 *
 * Pot wiring follows the physical convention, so the knobs read the way they do on an instrument:
 * - Volume: "a" to ground, "b" to the hot lead, wiper out. Output is the a-side of the divider, so
 *   position 1 is full volume.
 * - Tone: "a" on the hot lead, wiper through the cap to ground, "b" left unconnected exactly as it
 *   is on a real tone pot. Position 1 leaves the full pot resistance in series with the cap
 *   (brightest); at 0 the cap shunts treble straight to ground.
 */
export const singlePickupVolumeTone: WiringPreset = {
  id: "wiring-single-pickup-vol-tone",
  name: "싱글 픽업 + 볼륨 + 톤",
  description:
    "픽업 1개, 볼륨/톤 포트, 톤 캡, 앰프 부하까지의 최소 구성. 볼륨·톤 노브를 돌리면 주파수 응답이 바로 바뀝니다.",
  category: "픽업 기본",
  outputTerminal: { partId: "VOL", terminalId: "wiper" },
  snapshot: {
    blocks: [],
    parts: [
      { id: "PU1", type: "pickup", x: 140, y: 200, rotation: 0, params: { ...VINTAGE_SINGLE_COIL } },
      { id: "VOL", type: "potentiometer", x: 340, y: 200, rotation: 0, params: { resistance: 250_000, position: 1, taper: "A" } },
      { id: "TONE", type: "potentiometer", x: 340, y: 350, rotation: 0, params: { resistance: 250_000, position: 1, taper: "A" } },
      { id: "Ctone", type: "capacitor", x: 490, y: 350, rotation: 0, params: { capacitance: 22e-9 } },
      { id: "Rload", type: "resistor", x: 560, y: 120, rotation: 0, params: { resistance: 1_000_000 } },
      { id: "G1", type: "ground", x: 110, y: 290, rotation: 0, params: {} },
      { id: "G2", type: "ground", x: 310, y: 290, rotation: 0, params: {} },
      { id: "G3", type: "ground", x: 520, y: 430, rotation: 0, params: {} },
      { id: "G4", type: "ground", x: 590, y: 210, rotation: 0, params: {} },
    ],
    wires: [
      { id: "wr1", a: { partId: "PU1", terminalId: "hot" }, b: { partId: "VOL", terminalId: "b" } },
      { id: "wr2", a: { partId: "PU1", terminalId: "gnd" }, b: { partId: "G1", terminalId: "gnd" } },
      { id: "wr3", a: { partId: "VOL", terminalId: "a" }, b: { partId: "G2", terminalId: "gnd" } },
      { id: "wr4", a: { partId: "PU1", terminalId: "hot" }, b: { partId: "TONE", terminalId: "a" } },
      { id: "wr5", a: { partId: "TONE", terminalId: "wiper" }, b: { partId: "Ctone", terminalId: "a" } },
      { id: "wr6", a: { partId: "Ctone", terminalId: "b" }, b: { partId: "G3", terminalId: "gnd" } },
      { id: "wr7", a: { partId: "VOL", terminalId: "wiper" }, b: { partId: "Rload", terminalId: "a" } },
      { id: "wr8", a: { partId: "Rload", terminalId: "b" }, b: { partId: "G4", terminalId: "gnd" } },
    ],
  },
  archive: {
    sourceRefs: [
      { label: "일반 공개 배선 관례 (제조사 서포트 배선도 및 DIY 커뮤니티 문서에서 확인되는 표준 구성)", url: "https://www.guitarnuts.com/wiring/" },
    ],
    disclaimer: "대표적인 표준 배선 구성이며 특정 제조사 제품의 실제 배선도를 복제한 것이 아닙니다. 부품값은 계열 대표 근사값입니다.",
  },
};
