import type { Element } from "../../solver/types";
import type { KnobSpec, LayoutSpot, PedalPreset, PresetCategory } from "../types";
import type { KitCircuit, KitMeta, KitPart, KitRail } from "./types";
import { stageBlocks } from "./stageBlocks";
import { parsePot, parseValue } from "./values";
import { bjtModel, diodeModel, jfetModel, opAmpModel, OPAMP_PINOUT } from "./partModels";
import { SILICON_DIODE_1N4148 } from "../deviceModels";
import { isLm386, lm386Elements, lm386Spots } from "./lm386";

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

/** Charge-pump ICs: the map turns their output pin into an ideal rail, so the package itself stamps nothing. */
const CHARGE_PUMPS = ["ICL7660", "7660", "TC1044", "MAX1044", "LT1054"];
const isChargePump = (part: string): boolean => CHARGE_PUMPS.some((p) => part.toUpperCase().replace(/\s+/g, "").startsWith(p));

/** Map placement refs onto element ids (or a pot's merged part): VCC -> Vcc; an op-amp's "U1A" is the element itself for a
 * single package (its id is the bare ref), and for a dual whose B half has no spot of its own the B
 * half goes one row under the A half. Refs that match no element are dropped. */
function resolveLayout(layout: Record<string, LayoutSpot>, elements: Element[]): Record<string, LayoutSpot> {
  const ids = new Set(elements.map((e) => e.id));
  const out: Record<string, LayoutSpot> = {};
  for (const [ref, spot] of Object.entries(layout)) {
    const id = ref === "VCC" ? "Vcc" : ref;
    if (ids.has(id)) out[id] = spot;
    // A three-lug pot is two elements (<ref>_1, <ref>_3) that the editor merges back into one part named <ref>.
    else if (ids.has(`${id}_1`) && ids.has(`${id}_3`)) out[id] = spot;
    else if (/A$/.test(id) && ids.has(id.slice(0, -1))) out[id.slice(0, -1)] = spot;
  }
  for (const id of ids) {
    if (/B$/.test(id) && !out[id] && out[`${id.slice(0, -1)}A`]) out[id] = { ...out[`${id.slice(0, -1)}A`], y: out[`${id.slice(0, -1)}A`].y + 120 };
  }
  return out;
}

/** LM386 internals have no AT line of their own: cluster them around the chip so they don't land on the auto grid. */
function withChipInternals(layout: Record<string, LayoutSpot>, parts: KitPart[], elements: Element[]): Record<string, LayoutSpot> {
  const ids = new Set(elements.map((e) => e.id));
  const extra = parts
    .filter((p) => p.kind === "IC" && isLm386(p.part ?? "") && layout[p.ref])
    .flatMap((p) => Object.entries(lm386Spots(p.ref, layout[p.ref])).filter(([id]) => ids.has(id) && !layout[id]));
  return { ...layout, ...Object.fromEntries(extra) };
}

const pair = (part: KitPart): [string, string] => {
  if (!Array.isArray(part.nodes) || part.nodes.length !== 2) throw new Error(`${part.ref}: expected two nodes`);
  return [part.nodes[0], part.nodes[1]];
};
const pins = (part: KitPart): Record<string, string> => {
  if (Array.isArray(part.nodes)) throw new Error(`${part.ref}: expected named pins`);
  return part.nodes;
};

type Rails = { supply: number; extra: KitRail[] };

function railVoltage(net: string, rails: Rails): number | undefined {
  if (net === "vcc") return rails.supply;
  if (net === "0") return 0;
  return rails.extra.find((r) => r.net === net)?.voltage;
}

function partElements(part: KitPart, rails: Rails, knobs: KnobSpec[]): Element[] {
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
        const { bodyDiode, ...fet } = model;
        return [
          { id: part.ref, type: "jfet", nodes: [p.g, p.d, p.s], ...fet },
          ...(bodyDiode ? [{ id: `${part.ref}_D`, type: "diode" as const, nodes: [p.s, p.d] as [string, string], ...SILICON_DIODE_1N4148 }] : []),
        ];
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
      if (isChargePump(part.part ?? "")) return [];
      if (isLm386(part.part ?? "")) {
        const p = pins(part);
        return lm386Elements(part.ref, p, { top: railVoltage(p["6"] ?? "", rails) ?? Math.max(rails.supply, 0), bottom: railVoltage(p["4"] ?? "", rails) ?? 0 });
      }
      const found = opAmpModel(part.part ?? "");
      if (!found) throw new UnsupportedKitError(`${part.ref}: no model for IC ${part.part}`);
      const p = pins(part);
      const pinout = OPAMP_PINOUT[found.channels];
      const top = railVoltage(p[pinout.vPlus] ?? "", rails) ?? Math.max(rails.supply, 0);
      const bottom = railVoltage(p[pinout.vMinus] ?? "", rails) ?? Math.min(rails.supply, 0);
      const { railPositive: _rp, railNegative: _rn, ...dynamics } = found.model;
      return pinout.channels.flatMap((ch, i): Element[] =>
        p[ch.out] && p[ch.inMinus] && p[ch.inPlus]
          ? [{ id: found.channels > 1 ? `${part.ref}${"ABCD"[i]}` : part.ref, type: "opamp", nodes: [p[ch.inPlus], p[ch.inMinus], p[ch.out]], openLoopGain: 1e5, ...dynamics, railPositive: top - RAIL_HEADROOM, railNegative: bottom + RAIL_HEADROOM }]
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
  const rails: Rails = { supply: kit.supply, extra: kit.rails ?? [] };
  const byRef = new Map(kit.parts.map((part) => [part.ref, partElements(part, rails, knobs)]));
  const parts = [...byRef.values()].flat();
  const meta: KitMeta = { goodsNo: kit.goodsNo, kitName: kit.kitName, motif: kit.motif, family: kit.type };
  const elements: Element[] = [
    { id: "V1", type: "vsource", nodes: ["in", "0"], voltage: 0 },
    { id: "Vcc", type: "vsource", nodes: ["vcc", "0"], voltage: kit.supply, role: "supply" },
    ...rails.extra.map((r, i): Element => ({ id: `Vrail${i + 1}`, type: "vsource", nodes: [r.net, "0"], voltage: r.voltage, role: "supply" })),
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
    ...(kit.layout ? { layout: withChipInternals(resolveLayout(kit.layout, elements), kit.parts, elements) } : {}),
    kit: meta,
    archive: {
      sourceRefs: [{ label: `페달파츠 ${kit.kitName} 키트 기판 레이아웃 (넷리스트 역설계)`, url: `https://www.pedalparts.co.kr/goods/goods_view.php?goodsNo=${kit.goodsNo}` }],
      disclaimer: "키트 기판 레이아웃의 패드·트레이스를 읽어 다시 작성한 넷리스트입니다. 부품값은 키트 부품표 기준이며 원본 페달 실측 회로와 다를 수 있습니다.",
    },
    build: () => ({ elements: elements.map((e) => ({ ...e, nodes: [...e.nodes] }) as Element) }),
  };
}
