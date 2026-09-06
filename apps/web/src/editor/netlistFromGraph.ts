import type { Netlist, Element } from "../core/solver/types";
import { PART_DEFS } from "./partDefs";
import { applyTaper, type TaperType } from "./taper";
import type { PartInstance, Wire } from "./types";

class UnionFind {
  private parent = new Map<string, string>();

  private find(key: string): string {
    if (!this.parent.has(key)) this.parent.set(key, key);
    let root = this.parent.get(key)!;
    if (root !== key) {
      root = this.find(root);
      this.parent.set(key, root);
    }
    return root;
  }

  union(a: string, b: string): void {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA !== rootB) this.parent.set(rootA, rootB);
  }

  leaderOf(key: string): string {
    return this.find(key);
  }
}

function terminalKey(partId: string, terminalId: string): string {
  return `${partId}:${terminalId}`;
}

export interface GraphNetlist {
  netlist: Netlist;
  /** All net names present in the graph, "0" (ground) first when present. */
  netNames: string[];
  /** id of the first vsource part found, if any - the conventional input source. */
  inputSourceId: string | null;
  /** Net name for every placed part's every terminal, keyed by "partId:terminalId" - the same
   * resolution used to build `netlist.elements[].nodes`, but keyed by the original canvas terminal
   * rather than the solver's per-element node index. This is what a KiCad-style export needs: it
   * wants each potentiometer's three real pins, not the two synthetic resistors the solver splits
   * it into for MNA stamping. */
  terminalNet: Map<string, string>;
}

/** Converts placed parts + wires into the solver's Netlist format via union-find over wired terminals. */
export function netlistFromGraph(parts: PartInstance[], wires: Wire[]): GraphNetlist {
  const uf = new UnionFind();

  for (const part of parts) {
    for (const terminal of PART_DEFS[part.type].terminals) {
      uf.leaderOf(terminalKey(part.id, terminal.id)); // ensure it's registered even if unwired
    }
  }
  for (const wire of wires) {
    uf.union(terminalKey(wire.a.partId, wire.a.terminalId), terminalKey(wire.b.partId, wire.b.terminalId));
  }

  const groundParts = parts.filter((p) => p.type === "ground");
  for (const gp of groundParts) {
    uf.union(terminalKey(gp.id, "gnd"), "__GND__");
  }
  const groundLeader = groundParts.length > 0 ? uf.leaderOf("__GND__") : null;

  const netNameByLeader = new Map<string, string>();
  let nextNetIndex = 1;
  const nameFor = (leader: string): string => {
    if (leader === groundLeader) return "0";
    if (!netNameByLeader.has(leader)) netNameByLeader.set(leader, `n${nextNetIndex++}`);
    return netNameByLeader.get(leader)!;
  };

  const nodeOfTerminal = (partId: string, terminalId: string): string => nameFor(uf.leaderOf(terminalKey(partId, terminalId)));

  const elements: Element[] = [];
  for (const part of parts) {
    if (part.type === "ground") continue;
    const terminals = PART_DEFS[part.type].terminals;
    const nodes = terminals.map((t) => nodeOfTerminal(part.id, t.id));

    switch (part.type) {
      case "resistor":
        elements.push({ id: part.id, type: "resistor", nodes: [nodes[0], nodes[1]], resistance: Number(part.params.resistance) });
        break;
      case "capacitor":
        elements.push({ id: part.id, type: "capacitor", nodes: [nodes[0], nodes[1]], capacitance: Number(part.params.capacitance) });
        break;
      case "inductor":
        elements.push({ id: part.id, type: "inductor", nodes: [nodes[0], nodes[1]], inductance: Number(part.params.inductance) });
        break;
      case "diode": {
        const seriesResistance = Number(part.params.seriesResistance) || 0;
        elements.push({
          id: part.id,
          type: "diode",
          nodes: [nodes[0], nodes[1]],
          saturationCurrent: Number(part.params.saturationCurrent),
          thermalVoltage: Number(part.params.thermalVoltage),
          emissionCoefficient: Number(part.params.emissionCoefficient),
          ...(seriesResistance > 0 ? { seriesResistance } : {}),
        });
        break;
      }
      case "bjt":
        elements.push({
          id: part.id,
          type: "bjt",
          nodes: [nodes[0], nodes[1], nodes[2]],
          polarity: part.params.polarity === "pnp" ? "pnp" : "npn",
          saturationCurrent: Number(part.params.saturationCurrent),
          thermalVoltage: Number(part.params.thermalVoltage),
          forwardBeta: Number(part.params.forwardBeta),
          reverseBeta: Number(part.params.reverseBeta),
        });
        break;
      case "jfet":
        elements.push({
          id: part.id,
          type: "jfet",
          nodes: [nodes[0], nodes[1], nodes[2]],
          idss: Number(part.params.idss),
          pinchOffVoltage: Number(part.params.pinchOffVoltage),
        });
        break;
      case "opamp": {
        const gbwpHz = Number(part.params.gbwpHz) || 0;
        const slewRateVPerUs = Number(part.params.slewRateVPerUs) || 0;
        const railPositive = Number(part.params.railPositive) || 0;
        const railNegative = Number(part.params.railNegative) || 0;
        elements.push({
          id: part.id,
          type: "opamp",
          nodes: [nodes[0], nodes[1], nodes[2]],
          openLoopGain: Number(part.params.openLoopGain),
          ...(gbwpHz > 0 ? { gbwpHz } : {}),
          ...(slewRateVPerUs > 0 ? { slewRateVPerUs } : {}),
          ...(railPositive > 0 && railNegative < 0 ? { railPositive, railNegative } : {}),
        });
        break;
      }
      case "vsource":
        elements.push({ id: part.id, type: "vsource", nodes: [nodes[0], nodes[1]], voltage: Number(part.params.voltage) });
        break;
      case "potentiometer": {
        // Modeled as two resistors split at the wiper's net - no synthetic node needed since the wiper terminal already has its own net.
        const total = Number(part.params.resistance);
        const taper = (part.params.taper as TaperType) ?? "B";
        const ratio = applyTaper(taper, Number(part.params.position));
        elements.push({ id: `${part.id}:a`, type: "resistor", nodes: [nodes[0], nodes[2]], resistance: Math.max(total * ratio, 1) });
        elements.push({ id: `${part.id}:b`, type: "resistor", nodes: [nodes[2], nodes[1]], resistance: Math.max(total * (1 - ratio), 1) });
        break;
      }
    }
  }

  const netNames = Array.from(new Set(elements.flatMap((e) => e.nodes)));
  if (groundLeader !== null && !netNames.includes("0")) netNames.unshift("0");

  // An explicit `role: "signalSource"` wins; otherwise fall back to the historical "first vsource
  // on the canvas" rule, but never on a source that has declared itself a supply/bias rail. That
  // fallback is what keeps every existing preset and saved circuit working unchanged.
  const sources = parts.filter((p) => p.type === "vsource");
  const inputSourceId = (sources.find((p) => p.role === "signalSource") ?? sources.find((p) => p.role === undefined))?.id ?? null;

  const terminalNet = new Map<string, string>();
  for (const part of parts) {
    for (const terminal of PART_DEFS[part.type].terminals) {
      terminalNet.set(terminalKey(part.id, terminal.id), nodeOfTerminal(part.id, terminal.id));
    }
  }

  return { netlist: { elements }, netNames, inputSourceId, terminalNet };
}
