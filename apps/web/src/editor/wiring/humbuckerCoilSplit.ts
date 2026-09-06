import { HUMBUCKER_SINGLE_COIL } from "../../core/library/deviceModels";
import type { WiringPreset } from "./types";

/**
 * A humbucker drawn as what it physically is - two coils in series - with a push-pull switch that
 * shorts the second coil out. That short is the coil split: with one coil bypassed the circuit sees
 * roughly half the inductance and half the DC resistance, so the resonant peak climbs and the
 * output drops, which is why a split humbucker reads as single-coil-ish.
 *
 * Modelling the humbucker as two separate coil parts (rather than one combined pickup) is what
 * makes the split expressible at all - see docs/plan-guitar-wiring.md §4-2.
 *
 * Accuracy note: the two coils' mutual inductance is not modelled (the solver has no coupled
 * inductors), so the series case is a little less inductive here than a real humbucker.
 */
export const humbuckerCoilSplit: WiringPreset = {
  id: "wiring-humbucker-coil-split",
  name: "험버커 코일 스플릿 (푸시풀)",
  description:
    "직렬로 쌓은 험버커 코일 2개 + 한 코일을 단락시키는 푸시풀 스위치. 스위치를 닫으면 공진이 올라가고 출력이 줄어드는 스플릿 동작을 그래프로 볼 수 있습니다.",
  category: "코일 스위칭",
  outputTerminal: { partId: "VOL", terminalId: "wiper" },
  snapshot: {
    blocks: [],
    parts: [
      { id: "COIL_A", type: "pickup", x: 140, y: 260, rotation: 0, params: { ...HUMBUCKER_SINGLE_COIL } },
      { id: "COIL_B", type: "pickup", x: 300, y: 260, rotation: 0, params: { ...HUMBUCKER_SINGLE_COIL } },
      { id: "SW_SPLIT", type: "spst", x: 300, y: 370, rotation: 0, params: { switchPosition: 0 } },
      { id: "VOL", type: "potentiometer", x: 470, y: 260, rotation: 0, params: { resistance: 500_000, position: 1, taper: "A" } },
      { id: "Rload", type: "resistor", x: 620, y: 160, rotation: 0, params: { resistance: 1_000_000 } },
      { id: "G1", type: "ground", x: 110, y: 350, rotation: 0, params: {} },
      { id: "G2", type: "ground", x: 440, y: 350, rotation: 0, params: {} },
      { id: "G3", type: "ground", x: 650, y: 250, rotation: 0, params: {} },
    ],
    wires: [
      { id: "ws1", a: { partId: "COIL_A", terminalId: "gnd" }, b: { partId: "G1", terminalId: "gnd" } },
      { id: "ws2", a: { partId: "COIL_A", terminalId: "hot" }, b: { partId: "COIL_B", terminalId: "gnd" } },
      { id: "ws3", a: { partId: "COIL_B", terminalId: "gnd" }, b: { partId: "SW_SPLIT", terminalId: "a" } },
      { id: "ws4", a: { partId: "COIL_B", terminalId: "hot" }, b: { partId: "SW_SPLIT", terminalId: "b" } },
      { id: "ws5", a: { partId: "COIL_B", terminalId: "hot" }, b: { partId: "VOL", terminalId: "b" } },
      { id: "ws6", a: { partId: "VOL", terminalId: "a" }, b: { partId: "G2", terminalId: "gnd" } },
      { id: "ws7", a: { partId: "VOL", terminalId: "wiper" }, b: { partId: "Rload", terminalId: "a" } },
      { id: "ws8", a: { partId: "Rload", terminalId: "b" }, b: { partId: "G3", terminalId: "gnd" } },
    ],
  },
  archive: {
    sourceRefs: [
      { label: "코일 스플릿 배선의 공개된 표준 구성 (DIY 커뮤니티 문서)", url: "https://www.guitarnuts.com/wiring/" },
    ],
    disclaimer: "표준 배선 구성의 재구성이며 특정 제조사 배선도를 복제한 것이 아닙니다. 코일 간 상호 인덕턴스는 모델링되지 않습니다.",
  },
};
