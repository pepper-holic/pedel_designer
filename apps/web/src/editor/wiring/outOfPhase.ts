import { VINTAGE_SINGLE_COIL, HOT_SINGLE_COIL } from "../../core/library/deviceModels";
import type { WiringPreset } from "./types";

/**
 * Two pickups always in parallel, with a DPDT that reverses one of them.
 *
 * The switch does not select pickups - it swaps which of pickup B's two leads goes to the output
 * and which goes to ground. In position 1 both pickups push the same way and their outputs add. In
 * position 2 pickup B is inverted, so the two partially cancel: the level drops and the frequencies
 * they share most strongly scoop out, giving the thin, hollow out-of-phase voice.
 *
 * The cancellation shows up in simulation because both coils are driven in phase as one signal
 * (VoltageSourceElement.isSignalSource) - reverse one and the sum genuinely subtracts.
 */
export const outOfPhaseSwitch: WiringPreset = {
  id: "wiring-out-of-phase",
  name: "위상 반전 스위치 (아웃 오브 페이즈)",
  description:
    "픽업 2개를 병렬로 두고 DPDT로 한쪽의 극성을 뒤집습니다. 반전 위치에서는 두 픽업이 서로 상쇄해 출력이 줄고 소리가 얇아집니다.",
  category: "코일 스위칭",
  outputTerminal: { partId: "VOL", terminalId: "wiper" },
  snapshot: {
    blocks: [],
    parts: [
      { id: "PU_A", type: "pickup", x: 140, y: 150, rotation: 0, params: { ...VINTAGE_SINGLE_COIL } },
      { id: "PU_B", type: "pickup", x: 140, y: 330, rotation: 0, params: { ...HOT_SINGLE_COIL } },
      { id: "SW_PHASE", type: "dpdt", x: 350, y: 330, rotation: 0, params: { switchPosition: 0 } },
      { id: "VOL", type: "potentiometer", x: 540, y: 230, rotation: 0, params: { resistance: 250_000, position: 1, taper: "A" } },
      { id: "Rload", type: "resistor", x: 690, y: 140, rotation: 0, params: { resistance: 1_000_000 } },
      { id: "G1", type: "ground", x: 110, y: 230, rotation: 0, params: {} },
      { id: "G2", type: "ground", x: 420, y: 430, rotation: 0, params: {} },
      { id: "G3", type: "ground", x: 510, y: 320, rotation: 0, params: {} },
      { id: "G4", type: "ground", x: 720, y: 220, rotation: 0, params: {} },
    ],
    wires: [
      // Pickup A is wired straight through - it is the reference the other one is compared against.
      { id: "wo1", a: { partId: "PU_A", terminalId: "gnd" }, b: { partId: "G1", terminalId: "gnd" } },
      { id: "wo2", a: { partId: "PU_A", terminalId: "hot" }, b: { partId: "VOL", terminalId: "b" } },
      // Pickup B's two leads land on the two commons, and the throws cross over.
      { id: "wo3", a: { partId: "PU_B", terminalId: "hot" }, b: { partId: "SW_PHASE", terminalId: "common1" } },
      { id: "wo4", a: { partId: "PU_B", terminalId: "gnd" }, b: { partId: "SW_PHASE", terminalId: "common2" } },
      { id: "wo5", a: { partId: "SW_PHASE", terminalId: "pole1ThrowA" }, b: { partId: "VOL", terminalId: "b" } },
      { id: "wo6", a: { partId: "SW_PHASE", terminalId: "pole1ThrowB" }, b: { partId: "G2", terminalId: "gnd" } },
      { id: "wo7", a: { partId: "SW_PHASE", terminalId: "pole2ThrowA" }, b: { partId: "G2", terminalId: "gnd" } },
      { id: "wo8", a: { partId: "SW_PHASE", terminalId: "pole2ThrowB" }, b: { partId: "VOL", terminalId: "b" } },
      { id: "wo9", a: { partId: "VOL", terminalId: "a" }, b: { partId: "G3", terminalId: "gnd" } },
      { id: "wo10", a: { partId: "VOL", terminalId: "wiper" }, b: { partId: "Rload", terminalId: "a" } },
      { id: "wo11", a: { partId: "Rload", terminalId: "b" }, b: { partId: "G4", terminalId: "gnd" } },
    ],
  },
  archive: {
    sourceRefs: [{ label: "위상 반전 스위치 배선의 공개된 표준 구성 (DIY 커뮤니티 문서)", url: "https://www.guitarnuts.com/wiring/" }],
    disclaimer: "표준 배선 구성의 재구성이며 특정 제조사 배선도를 복제한 것이 아닙니다. 부품값은 계열 대표 근사값입니다.",
  },
};
