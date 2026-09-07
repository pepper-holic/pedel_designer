import type { Netlist, Element } from "../core/solver/types";
import { PART_DEFS, SWITCH_ON_OHMS, SWITCH_OFF_OHMS } from "./partDefs";
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

  // Nets created *inside* a composite part (currently only the pickup's series R-L chain). They are
  // real solver nodes but not user-visible connection points, so they are kept out of `netNames` -
  // otherwise they would show up as pickable output nodes in the UI.
  const internalNets = new Set<string>();

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
      case "pickup": {
        // Standard lumped pickup model: an ideal signal source behind the coil's DC resistance and
        // inductance, with the winding self-capacitance across the output. The L and the total
        // capacitance hanging off "hot" (this Cp + cable + pots) form the resonant peak.
        const coilInner = `${part.id}~src`;
        const coilMid = `${part.id}~coil`;
        internalNets.add(coilInner);
        internalNets.add(coilMid);
        const gndNode = nodes[0];
        const hotNode = nodes[1];
        elements.push({ id: `${part.id}:src`, type: "vsource", nodes: [coilInner, gndNode], voltage: 0, isSignalSource: true });
        elements.push({ id: `${part.id}:rdc`, type: "resistor", nodes: [coilInner, coilMid], resistance: Number(part.params.dcResistance) });
        elements.push({ id: `${part.id}:l`, type: "inductor", nodes: [coilMid, hotNode], inductance: Number(part.params.inductance) });
        elements.push({ id: `${part.id}:cp`, type: "capacitor", nodes: [hotNode, gndNode], capacitance: Number(part.params.selfCapacitance) });
        break;
      }
      case "spst":
      case "spdt":
      case "dpdt": {
        // Every switch is just contacts: a near-short for the selected throw, a near-open for the
        // rest. Stamping them as resistors keeps switching entirely out of the solver, the same way
        // the potentiometer below is stamped as two resistors.
        // Every switch here is two-position. Anything other than 1 falls back to position 0 - a
        // switch with no closed contact would silently break the circuit with nothing on screen to
        // explain why.
        const position = Number(part.params.switchPosition) === 1 ? 1 : 0;
        const contact = (closed: boolean) => (closed ? SWITCH_ON_OHMS : SWITCH_OFF_OHMS);

        if (part.type === "spst") {
          elements.push({ id: `${part.id}:sw`, type: "resistor", nodes: [nodes[0], nodes[1]], resistance: contact(position === 1) });
          break;
        }
        // [common, throwA, throwB] for SPDT; DPDT repeats that layout for a second pole, and both
        // poles follow the same lever.
        const poles: [string, string, string][] =
          part.type === "spdt"
            ? [[nodes[0], nodes[1], nodes[2]]]
            : [
                [nodes[0], nodes[1], nodes[2]],
                [nodes[3], nodes[4], nodes[5]],
              ];
        poles.forEach(([common, throwA, throwB], i) => {
          elements.push({ id: `${part.id}:p${i + 1}a`, type: "resistor", nodes: [common, throwA], resistance: contact(position === 0) });
          elements.push({ id: `${part.id}:p${i + 1}b`, type: "resistor", nodes: [common, throwB], resistance: contact(position === 1) });
        });
        break;
      }
      case "blade3":
      case "blade5":
      case "rotary6": {
        // A guitar blade selector is not a 1-of-N switch. With N input contacts it has 2N-1
        // detents: the even ones sit on a single contact, the odd ones bridge two adjacent
        // contacts - which is where the "both pickups" combinations come from. A rotary is the
        // plain 1-of-N case, so it shares this code with bridging turned off.
        const bridging = part.type !== "rotary6";
        const inputCount = nodes.length - 1;
        const positionCount = bridging ? inputCount * 2 - 1 : inputCount;
        const raw = Math.trunc(Number(part.params.switchPosition));
        const position = Number.isFinite(raw) && raw >= 0 && raw < positionCount ? raw : 0;
        const primary = bridging ? Math.floor(position / 2) : position;
        const bridgesNext = bridging && position % 2 === 1;
        for (let i = 0; i < inputCount; i++) {
          const closed = i === primary || (bridgesNext && i === primary + 1);
          elements.push({
            id: `${part.id}:in${i + 1}`,
            type: "resistor",
            nodes: [nodes[0], nodes[i + 1]],
            resistance: closed ? SWITCH_ON_OHMS : SWITCH_OFF_OHMS,
          });
        }
        break;
      }
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

  const netNames = Array.from(new Set(elements.flatMap((e) => e.nodes))).filter((n) => !internalNets.has(n));
  if (groundLeader !== null && !netNames.includes("0")) netNames.unshift("0");

  // An explicit `role: "signalSource"` wins; otherwise fall back to the historical "first vsource
  // on the canvas" rule, but never on a source that has declared itself a supply/bias rail. That
  // fallback is what keeps every existing preset and saved circuit working unchanged.
  const sources = parts.filter((p) => p.type === "vsource");
  const explicitSource = sources.find((p) => p.role === "signalSource");
  // A pickup carries its own signal source, and it outranks an unmarked bare vsource: placing a
  // pickup on the canvas is an unambiguous statement about where the signal comes from.
  const pickup = parts.find((p) => p.type === "pickup");
  const inputSourceId =
    explicitSource?.id ?? (pickup ? `${pickup.id}:src` : undefined) ?? sources.find((p) => p.role === undefined)?.id ?? null;

  const terminalNet = new Map<string, string>();
  for (const part of parts) {
    for (const terminal of PART_DEFS[part.type].terminals) {
      terminalNet.set(terminalKey(part.id, terminal.id), nodeOfTerminal(part.id, terminal.id));
    }
  }

  return { netlist: { elements }, netNames, inputSourceId, terminalNet };
}
