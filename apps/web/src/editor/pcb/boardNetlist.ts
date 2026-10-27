import { PART_DEFS, type PartType } from "../partDefs";
import { partValueLabel } from "../valueLabel";
import { computeOperatingPoint } from "../operatingPoint";
import type { GraphNetlist } from "../netlistFromGraph";
import type { PartInstance } from "../types";
import { footprintFor } from "./footprintAssign";
import { FOOTPRINTS, padForTerminal, type FootprintDef } from "./footprints";

export interface BoardPad {
  number: string;
  /** Empty for a pad nothing connects to. */
  net: string;
}

export interface BoardComponent {
  /** Reference designator (R1, C3, Q1, J1, ...). */
  ref: string;
  /** The schematic part it came from; null for connectors the board adds (output, op-amp power). */
  partId: string | null;
  footprint: FootprintDef;
  value: string;
  symbol: { lib: string; part: string };
  pads: BoardPad[];
}

/**
 * The circuit as something to build: one component per physical part with a footprint, every pad
 * on a named net, plus the connectors a real board needs that a simulation does not (the output
 * jack, op-amp power). The KiCad netlist, the BOM's package column, the stripboard and the PCB
 * generators all read this - one place decides which pad is which.
 */
export interface BoardNetlist {
  components: BoardComponent[];
  nets: string[];
  /** Things a builder must know that the board cannot say by itself. */
  notes: string[];
}

export const GROUND_NET = "GND";

const REF_PREFIX: Record<PartType, string> = {
  resistor: "R",
  capacitor: "C",
  inductor: "L",
  diode: "D",
  bjt: "Q",
  jfet: "Q",
  opamp: "U",
  potentiometer: "RV",
  spst: "SW",
  spdt: "SW",
  dpdt: "SW",
  blade3: "SW",
  blade5: "SW",
  rotary6: "SW",
  pickup: "J",
  vsource: "J",
  coupledInductors: "T",
  ground: "",
};

/** Maps this app's part to a KiCad symbol whose pin numbers match the footprint's pads. */
function kicadSymbol(part: PartInstance, footprint: FootprintDef): { lib: string; part: string } {
  const order = footprint.id.startsWith("to92-") ? footprint.id.slice(5).toUpperCase() : "";
  switch (part.type) {
    case "resistor":
      return { lib: "Device", part: "R" };
    case "capacitor":
      return { lib: "Device", part: footprint.polarized ? "C_Polarized" : "C" };
    case "inductor":
      return { lib: "Device", part: "L" };
    case "diode":
      return { lib: "Device", part: footprint.id.startsWith("led") ? "LED" : "D" };
    case "bjt":
      return { lib: "Device", part: `Q_${String(part.params.polarity) === "pnp" ? "PNP" : "NPN"}_${order}` };
    case "jfet":
      return { lib: "Device", part: `Q_NJFET_${order}` };
    case "opamp":
      return { lib: "Amplifier_Operational", part: "TL071" };
    case "potentiometer":
      return { lib: "Device", part: footprint.offBoard ? "Conn_01x03" : "R_Potentiometer" };
    default:
      return { lib: "Connector", part: `Conn_01x${String(footprint.pads.length).padStart(2, "0")}` };
  }
}

function boardValue(part: PartInstance): string {
  if (part.type === "vsource") {
    if (part.role === "supply") return `DC 전원 ${part.params.voltage}V`;
    if (part.role === "bias") return `바이어스 ${part.params.voltage}V`;
    return "입력 잭 (IN)";
  }
  if (part.type === "bjt") return String(part.params.polarity ?? "npn").toUpperCase();
  return partValueLabel(part) ?? PART_DEFS[part.type].label;
}

const VALID_REF = /^[A-Za-z]{1,3}\d+$/;

/** Builds the board view of a circuit. `outputNode` gets an output connector when set. */
export function buildBoardNetlist(parts: PartInstance[], graph: GraphNetlist, outputNode = ""): BoardNetlist {
  const notes: string[] = [];
  const inputNet = graph.inputSourceId ? graph.terminalNet.get(`${graph.inputSourceId}:positive`) : undefined;
  const netName = (net: string | undefined): string => {
    if (net === undefined) return "";
    if (net === "0") return GROUND_NET;
    if (net === outputNode) return "OUT";
    if (net === inputNet) return "IN";
    return net;
  };

  const usedRefs = new Set(parts.filter((p) => p.type !== "ground" && VALID_REF.test(p.id)).map((p) => p.id));
  const counters = new Map<string, number>();
  const nextRef = (prefix: string) => {
    let n = counters.get(prefix) ?? 1;
    while (usedRefs.has(`${prefix}${n}`)) n++;
    counters.set(prefix, n + 1);
    usedRefs.add(`${prefix}${n}`);
    return `${prefix}${n}`;
  };
  const claimed = new Set<string>();

  let operatingPoint: ReturnType<typeof computeOperatingPoint> | undefined;
  const dcVolts = (net: string | undefined) => {
    operatingPoint ??= computeOperatingPoint(graph);
    return net === undefined ? 0 : (operatingPoint?.voltages.get(net) ?? 0);
  };

  const components: BoardComponent[] = [];
  let needsOpampPower = false;
  for (const part of parts) {
    const footprint = footprintFor(part);
    if (!footprint) continue;
    const terminals = PART_DEFS[part.type].terminals;
    const rawNets = terminals.map((t) => graph.terminalNet.get(`${part.id}:${t.id}`));
    const pads: BoardPad[] = terminals.map((t, i) => ({ number: padForTerminal(footprint, t.id, i), net: netName(rawNets[i]) }));

    if (footprint.polarized) {
      // An electrolytic's + lead goes to whichever side sits higher at DC. Swapping the pad numbers
      // (rather than the terminals) keeps "pad 1 is +" true for the footprint.
      const [va, vb] = [dcVolts(rawNets[0]), dcVolts(rawNets[1])];
      if (vb > va) [pads[0].number, pads[1].number] = [pads[1].number, pads[0].number];
      if (Math.abs(va - vb) < 0.05) notes.push(`${part.id}: 양단 DC 전압차가 거의 없어 극성을 정할 수 없습니다 - 전해 대신 필름/무극성 커패시터를 권장합니다.`);
    }
    for (const supply of footprint.supplyPads ?? []) {
      pads.push({ number: supply.number, net: supply.net === "GND" ? GROUND_NET : supply.net });
      if (supply.net !== "GND") needsOpampPower = true;
    }
    if (part.type === "vsource" && part.role === "bias") {
      notes.push(`${part.id}: 시뮬레이션의 이상적 바이어스 전압원입니다 - 실제 보드에선 분압 저항 2개 + 필터 커패시터(VREF)로 만들어 이 패드에 연결하세요.`);
    }

    const ref = VALID_REF.test(part.id) && !claimed.has(part.id) ? part.id : nextRef(REF_PREFIX[part.type]);
    claimed.add(ref);
    components.push({ ref, partId: part.id, footprint, value: boardValue(part), symbol: kicadSymbol(part, footprint), pads });
  }

  if (needsOpampPower) {
    components.push({
      ref: nextRef("J"),
      partId: null,
      footprint: FOOTPRINTS.wire3,
      value: "op-amp 전원 (V+ / GND / V-)",
      symbol: { lib: "Connector", part: "Conn_01x03" },
      pads: [
        { number: "1", net: "V+" },
        { number: "2", net: GROUND_NET },
        { number: "3", net: "V-" },
      ],
    });
    notes.push(
      "op-amp는 시뮬레이션처럼 접지 기준 ±전원(V+/V-)에 연결했습니다. 9V 단일 전원 페달로 만들려면 접지 대신 4.5V VREF를 기준으로 하는 바이어스 회로가 추가로 필요합니다.",
    );
  }
  if (outputNode) {
    components.push({
      ref: nextRef("J"),
      partId: null,
      footprint: FOOTPRINTS.wire2,
      value: "출력 잭 (OUT)",
      symbol: { lib: "Connector", part: "Conn_01x02" },
      pads: [
        { number: "1", net: "OUT" },
        { number: "2", net: GROUND_NET },
      ],
    });
  }

  const nets = [...new Set(components.flatMap((c) => c.pads.map((p) => p.net)).filter((n) => n !== ""))];
  nets.sort((a, b) => (a === GROUND_NET ? -1 : b === GROUND_NET ? 1 : a.localeCompare(b, "en", { numeric: true })));
  return { components, nets, notes };
}
