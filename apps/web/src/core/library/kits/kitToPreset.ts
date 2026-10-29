import type { Element } from "../../solver/types";
import type { KnobSpec, PedalPreset, PresetCategory } from "../types";
import type { KitCircuit, KitMeta, KitPart } from "./types";
import { stageBlocks } from "./stageBlocks";
import { parsePot, parseValue } from "./values";
import { bjtModel, diodeModel, jfetModel, opAmpModel, OPAMP_PINOUT } from "./partModels";

/** Op-amp outputs stop this far short of the supply rails (a TL072/4558 on 9V swings ~1-8V). */
const RAIL_HEADROOM = 1.2;
/** The amp input the pedal drives. */
const LOAD_RESISTANCE = 1_000_000;

const CATEGORY: Record<string, PresetCategory> = {
  overdrive: "오버드라이브",
  distortion: "디스토션",
  fuzz: "퍼즈",
  "buffer-boost": "부스트",
  preamp: "디스토션",
  eq: "톤/EQ",
};

export class UnsupportedKitError extends Error {}

const pair = (part: KitPart): [string, string] => {
  if (!Array.isArray(part.nodes) || part.nodes.length !== 2) throw new Error(`${part.ref}: expected two nodes`);
  return [part.nodes[0], part.nodes[1]];
};
const pins = (part: KitPart): Record<string, string> => {
  if (Array.isArray(part.nodes)) throw new Error(`${part.ref}: expected named pins`);
  return part.nodes;
};

function railVoltage(net: string, supply: number): number | undefined {
  if (net === "vcc") return supply;
  if (net === "0") return 0;
  return undefined;
}

function partElements(part: KitPart, supply: number, knobs: KnobSpec[]): Element[] {
  switch (part.kind) {
    case "R":
      return [{ id: part.ref, type: "resistor", nodes: pair(part), resistance: parseValue(part.value!) }];
    case "C":
      return [{ id: part.ref, type: "capacitor", nodes: pair(part), capacitance: parseValue(part.value!) }];
    case "L":
      return [{ id: part.ref, type: "inductor", nodes: pair(part), inductance: parseValue(part.value!) }];
    case "D": {
      const model = diodeModel(part.part ?? "");
      if (!model) throw new UnsupportedKitError(`${part.ref}: no diode model for ${part.part}`);
      const p = pins(part);
      return [{ id: part.ref, type: "diode", nodes: [p.a, p.k], ...model }];
    }
    case "Q": {
      const p = pins(part);
      if (p.g) {
        const model = jfetModel(part.part ?? "");
        if (!model) throw new UnsupportedKitError(`${part.ref}: no JFET model for ${part.part}`);
        return [{ id: part.ref, type: "jfet", nodes: [p.g, p.d, p.s], ...model }];
      }
      const model = bjtModel(part.part ?? "");
      if (!model) throw new UnsupportedKitError(`${part.ref}: no transistor model for ${part.part}`);
      return [{ id: part.ref, type: "bjt", nodes: [p.b, p.c, p.e], ...model }];
    }
    case "POT": {
      if (!Array.isArray(part.nodes) || part.nodes.length !== 3) throw new Error(`${part.ref}: a pot needs lug1, wiper, lug3`);
      const [lug1, wiper, lug3] = part.nodes;
      const { taper, resistance } = parsePot(part.value!);
      // A wiper tied to one lug is a variable resistor between the wiper and the other lug.
      // Clockwise moves the wiper from lug1 toward lug3, so with lug1 tied it shrinks (reverse).
      if (wiper === lug1 || wiper === lug3) {
        const tiedToLug1 = wiper === lug1;
        const free = tiedToLug1 ? lug3 : lug1;
        knobs.push({ kind: "rheostat", id: part.ref, label: part.ref, element: part.ref, maxResistance: resistance, taper, ...(tiedToLug1 ? { reverse: true } : {}) });
        return [{ id: part.ref, type: "resistor", nodes: [free, wiper], resistance: resistance / 2 }];
      }
      // Loaded at mid-travel; the editor turns the two halves into one potentiometer part.
      knobs.push({ kind: "pot", id: part.ref, label: part.ref, upper: `${part.ref}_1`, lower: `${part.ref}_3`, taper });
      return [
        { id: `${part.ref}_1`, type: "resistor", nodes: [lug1, wiper], resistance: resistance / 2 },
        { id: `${part.ref}_3`, type: "resistor", nodes: [wiper, lug3], resistance: resistance / 2 },
      ];
    }
    case "IC": {
      const found = opAmpModel(part.part ?? "");
      if (!found) throw new UnsupportedKitError(`${part.ref}: no model for IC ${part.part}`);
      const p = pins(part);
      const pinout = OPAMP_PINOUT[found.channels];
      const top = railVoltage(p[pinout.vPlus] ?? "", supply) ?? supply;
      const bottom = railVoltage(p[pinout.vMinus] ?? "", supply) ?? 0;
      const { railPositive: _rp, railNegative: _rn, ...dynamics } = found.model;
      return pinout.channels.flatMap((ch, i): Element[] =>
        p[ch.out] && p[ch.inMinus] && p[ch.inPlus]
          ? [{ id: found.channels === 2 ? `${part.ref}${"AB"[i]}` : part.ref, type: "opamp", nodes: [p[ch.inPlus], p[ch.inMinus], p[ch.out]], openLoopGain: 1e5, ...dynamics, railPositive: top - RAIL_HEADROOM, railNegative: bottom + RAIL_HEADROOM }]
          : [],
      );
    }
  }
}

/**
 * Turn a kit circuit into a preset the editor can load: the board's parts as solver elements, a 9V
 * supply on "vcc", the audio input on "in" and a 1MΩ amp input on "out". Pots become knobs.
 * Throws UnsupportedKitError when a part has no simulation model (delay chips, OTAs, MOSFETs...).
 */
export function kitToPreset(kit: KitCircuit): PedalPreset {
  const knobs: KnobSpec[] = [];
  const byRef = new Map(kit.parts.map((part) => [part.ref, partElements(part, kit.supply, knobs)]));
  const parts = [...byRef.values()].flat();
  const meta: KitMeta = { goodsNo: kit.goodsNo, kitName: kit.kitName, motif: kit.motif, family: kit.type };
  const elements: Element[] = [
    { id: "V1", type: "vsource", nodes: ["in", "0"], voltage: 0 },
    { id: "Vcc", type: "vsource", nodes: ["vcc", "0"], voltage: kit.supply, role: "supply" },
    ...parts,
    { id: "RLOAD", type: "resistor", nodes: ["out", "0"], resistance: LOAD_RESISTANCE },
  ];
  return {
    id: kit.id,
    name: `${kit.kitName} (${kit.motif} 스타일, 키트 기판)`,
    description: kit.description,
    category: CATEGORY[kit.type] ?? "오버드라이브",
    inputSourceId: "V1",
    tapNodes: ["in", "out"],
    outputNode: "out",
    defaultParams: {},
    knobs,
    blocks: stageBlocks(kit.stages ?? [], byRef, elements),
    kit: meta,
    archive: {
      sourceRefs: [{ label: `페달파츠 ${kit.kitName} 키트 기판 레이아웃 (넷리스트 역설계)`, url: `https://www.pedalparts.co.kr/goods/goods_view.php?goodsNo=${kit.goodsNo}` }],
      disclaimer: "키트 기판 레이아웃의 패드·트레이스를 읽어 다시 작성한 넷리스트입니다. 부품값은 키트 부품표 기준이며 원본 페달 실측 회로와 다를 수 있습니다.",
    },
    build: () => ({ elements: elements.map((e) => ({ ...e, nodes: [...e.nodes] }) as Element) }),
  };
}
