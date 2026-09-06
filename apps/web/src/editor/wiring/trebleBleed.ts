import { PAF_STYLE_HUMBUCKER } from "../../core/library/deviceModels";
import type { PartInstance, Wire } from "../types";
import type { WiringPreset } from "./types";

/**
 * Turning a passive volume pot down does not just lower the level: the pot's remaining resistance
 * forms a low-pass with the cable and the amp's input capacitance, so the treble goes first and the
 * guitar sounds dull long before it sounds quiet. A treble-bleed network bridges the pot's input to
 * its wiper so the highs get a path past the attenuation.
 *
 * The three common networks trade off differently, and they only differ by two components, so they
 * are generated from one base circuit here rather than four near-identical files. Load them one
 * after another with the volume left where it is to compare.
 */

/** Volume position the presets ship at. Rolled well down, because at full volume every one of these
 * networks does nothing at all - there is no attenuation to bypass. */
const ROLLED_BACK_VOLUME = 0.35;

function baseParts(): PartInstance[] {
  return [
    { id: "PU1", type: "pickup", x: 140, y: 220, rotation: 0, params: { ...PAF_STYLE_HUMBUCKER } },
    { id: "VOL", type: "potentiometer", x: 360, y: 220, rotation: 0, params: { resistance: 500_000, position: ROLLED_BACK_VOLUME, taper: "A" } },
    // Stands in for a few metres of cable plus the amp input - what the volume pot has to drive.
    { id: "Ccable", type: "capacitor", x: 540, y: 320, rotation: 0, params: { capacitance: 470e-12 } },
    { id: "Rload", type: "resistor", x: 540, y: 150, rotation: 0, params: { resistance: 1_000_000 } },
    { id: "G1", type: "ground", x: 110, y: 300, rotation: 0, params: {} },
    { id: "G2", type: "ground", x: 330, y: 300, rotation: 0, params: {} },
    { id: "G3", type: "ground", x: 570, y: 400, rotation: 0, params: {} },
    { id: "G4", type: "ground", x: 570, y: 230, rotation: 0, params: {} },
  ];
}

function baseWires(): Wire[] {
  return [
    { id: "wb1", a: { partId: "PU1", terminalId: "gnd" }, b: { partId: "G1", terminalId: "gnd" } },
    { id: "wb2", a: { partId: "PU1", terminalId: "hot" }, b: { partId: "VOL", terminalId: "b" } },
    { id: "wb3", a: { partId: "VOL", terminalId: "a" }, b: { partId: "G2", terminalId: "gnd" } },
    { id: "wb4", a: { partId: "VOL", terminalId: "wiper" }, b: { partId: "Ccable", terminalId: "a" } },
    { id: "wb5", a: { partId: "Ccable", terminalId: "b" }, b: { partId: "G3", terminalId: "gnd" } },
    { id: "wb6", a: { partId: "VOL", terminalId: "wiper" }, b: { partId: "Rload", terminalId: "a" } },
    { id: "wb7", a: { partId: "Rload", terminalId: "b" }, b: { partId: "G4", terminalId: "gnd" } },
  ];
}

function bleedPreset(
  id: string,
  name: string,
  description: string,
  extraParts: PartInstance[],
  extraWires: Wire[],
): WiringPreset {
  return {
    id,
    name,
    description,
    category: "톤 회로",
    outputTerminal: { partId: "VOL", terminalId: "wiper" },
    snapshot: { blocks: [], parts: [...baseParts(), ...extraParts], wires: [...baseWires(), ...extraWires] },
    archive: {
      sourceRefs: [{ label: "트레블 블리드 회로의 공개된 표준 구성 (DIY 커뮤니티 문서)", url: "https://www.guitarnuts.com/wiring/" }],
      disclaimer: "표준 배선 구성의 재구성이며 특정 제조사 배선도를 복제한 것이 아닙니다. 부품값은 흔히 쓰이는 대표값입니다.",
    },
  };
}

export const trebleBleedNone = bleedPreset(
  "wiring-treble-bleed-none",
  "볼륨 감쇠 기준 (트레블 블리드 없음)",
  "볼륨을 35%로 내린 상태의 기준 회로. 아래 세 가지 트레블 블리드와 주파수 응답을 비교하기 위한 출발점입니다.",
  [],
  [],
);

export const trebleBleedCapOnly = bleedPreset(
  "wiring-treble-bleed-cap",
  "트레블 블리드 A (캡만)",
  "볼륨 포트 입력과 와이퍼를 커패시터로만 연결. 고음이 가장 많이 살아나지만 과하면 얇아집니다.",
  [{ id: "Cbleed", type: "capacitor", x: 360, y: 90, rotation: 0, params: { capacitance: 1e-9 } }],
  [
    { id: "wbc1", a: { partId: "VOL", terminalId: "b" }, b: { partId: "Cbleed", terminalId: "a" } },
    { id: "wbc2", a: { partId: "Cbleed", terminalId: "b" }, b: { partId: "VOL", terminalId: "wiper" } },
  ],
);

export const trebleBleedCapParallelResistor = bleedPreset(
  "wiring-treble-bleed-cap-parallel-r",
  "트레블 블리드 B (캡 + 병렬 저항)",
  "커패시터에 저항을 병렬로 더한 방식. 고음 보존량을 저항으로 눌러 테이퍼가 더 자연스럽습니다.",
  [
    { id: "Cbleed", type: "capacitor", x: 360, y: 90, rotation: 0, params: { capacitance: 1e-9 } },
    { id: "Rbleed", type: "resistor", x: 360, y: 20, rotation: 0, params: { resistance: 150_000 } },
  ],
  [
    { id: "wbp1", a: { partId: "VOL", terminalId: "b" }, b: { partId: "Cbleed", terminalId: "a" } },
    { id: "wbp2", a: { partId: "Cbleed", terminalId: "b" }, b: { partId: "VOL", terminalId: "wiper" } },
    { id: "wbp3", a: { partId: "VOL", terminalId: "b" }, b: { partId: "Rbleed", terminalId: "a" } },
    { id: "wbp4", a: { partId: "Rbleed", terminalId: "b" }, b: { partId: "VOL", terminalId: "wiper" } },
  ],
);

export const trebleBleedCapSeriesResistor = bleedPreset(
  "wiring-treble-bleed-cap-series-r",
  "트레블 블리드 C (캡 + 직렬 저항)",
  "커패시터와 저항을 직렬로 연결한 방식. 통과시키는 고음의 양 자체를 제한해 가장 절제된 특성입니다.",
  [
    { id: "Cbleed", type: "capacitor", x: 330, y: 90, rotation: 0, params: { capacitance: 1e-9 } },
    { id: "Rbleed", type: "resistor", x: 450, y: 90, rotation: 0, params: { resistance: 130_000 } },
  ],
  [
    { id: "wbs1", a: { partId: "VOL", terminalId: "b" }, b: { partId: "Cbleed", terminalId: "a" } },
    { id: "wbs2", a: { partId: "Cbleed", terminalId: "b" }, b: { partId: "Rbleed", terminalId: "a" } },
    { id: "wbs3", a: { partId: "Rbleed", terminalId: "b" }, b: { partId: "VOL", terminalId: "wiper" } },
  ],
);
