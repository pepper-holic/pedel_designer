import { HUMBUCKER_SINGLE_COIL } from "../../core/library/deviceModels";
import type { WiringPreset } from "./types";

/**
 * The other classic push-pull trick: the same two humbucker coils rewired between series and
 * parallel by a DPDT.
 *
 * - Series (position 1): coil A's finish feeds coil B's start; inductance and DC resistance add, so
 *   the resonant peak sits low and the output is loud - the stock humbucker sound.
 * - Parallel (position 2): both coils start at ground and both finishes meet at the output; the
 *   pair looks like half the inductance and half the resistance, so the peak climbs and the level
 *   drops - brighter and thinner, but still hum-cancelling (unlike a split).
 *
 * Wiring: coil A's start and coil B's finish are hard-wired (ground and output). Pole 1 decides
 * what coil B's start meets - coil A's finish (series) or ground (parallel). Pole 2 only does
 * something in parallel, where it also ties coil A's finish to the output. Pole 2's series lug is
 * intentionally unconnected, exactly as it is on a real push-pull.
 */
export const humbuckerSeriesParallel: WiringPreset = {
  id: "wiring-humbucker-series-parallel",
  name: "험버커 직렬/병렬 전환 (DPDT)",
  description:
    "험버커 코일 2개를 DPDT로 직렬/병렬 전환. 병렬로 바꾸면 인덕턴스가 절반이 되어 공진이 위로 올라가고 출력이 내려갑니다.",
  category: "코일 스위칭",
  outputTerminal: { partId: "VOL", terminalId: "wiper" },
  snapshot: {
    blocks: [],
    parts: [
      { id: "COIL_B", type: "pickup", x: 140, y: 170, rotation: 0, params: { ...HUMBUCKER_SINGLE_COIL } },
      { id: "COIL_A", type: "pickup", x: 140, y: 310, rotation: 0, params: { ...HUMBUCKER_SINGLE_COIL } },
      { id: "SW_SP", type: "dpdt", x: 330, y: 240, rotation: 0, params: { switchPosition: 0 } },
      { id: "VOL", type: "potentiometer", x: 510, y: 240, rotation: 0, params: { resistance: 500_000, position: 1, taper: "A" } },
      { id: "Rload", type: "resistor", x: 660, y: 150, rotation: 0, params: { resistance: 1_000_000 } },
      { id: "G1", type: "ground", x: 110, y: 400, rotation: 0, params: {} },
      { id: "G2", type: "ground", x: 400, y: 340, rotation: 0, params: {} },
      { id: "G3", type: "ground", x: 480, y: 330, rotation: 0, params: {} },
      { id: "G4", type: "ground", x: 690, y: 240, rotation: 0, params: {} },
    ],
    wires: [
      { id: "wp1", a: { partId: "COIL_A", terminalId: "gnd" }, b: { partId: "G1", terminalId: "gnd" } },
      { id: "wp2", a: { partId: "SW_SP", terminalId: "common1" }, b: { partId: "COIL_B", terminalId: "gnd" } },
      { id: "wp3", a: { partId: "SW_SP", terminalId: "pole1ThrowA" }, b: { partId: "COIL_A", terminalId: "hot" } },
      { id: "wp4", a: { partId: "SW_SP", terminalId: "pole1ThrowB" }, b: { partId: "G2", terminalId: "gnd" } },
      { id: "wp5", a: { partId: "SW_SP", terminalId: "common2" }, b: { partId: "COIL_A", terminalId: "hot" } },
      { id: "wp6", a: { partId: "SW_SP", terminalId: "pole2ThrowB" }, b: { partId: "VOL", terminalId: "b" } },
      { id: "wp7", a: { partId: "COIL_B", terminalId: "hot" }, b: { partId: "VOL", terminalId: "b" } },
      { id: "wp8", a: { partId: "VOL", terminalId: "a" }, b: { partId: "G3", terminalId: "gnd" } },
      { id: "wp9", a: { partId: "VOL", terminalId: "wiper" }, b: { partId: "Rload", terminalId: "a" } },
      { id: "wp10", a: { partId: "Rload", terminalId: "b" }, b: { partId: "G4", terminalId: "gnd" } },
    ],
  },
  archive: {
    sourceRefs: [
      { label: "직렬/병렬 푸시풀 배선의 공개된 표준 구성 (DIY 커뮤니티 문서)", url: "https://www.guitarnuts.com/wiring/" },
    ],
    disclaimer: "표준 배선 구성의 재구성이며 특정 제조사 배선도를 복제한 것이 아닙니다. 코일 간 상호 인덕턴스는 모델링되지 않습니다.",
  },
};
