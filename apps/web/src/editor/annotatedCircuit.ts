import { graphFromNetlist } from "./graphFromNetlist";
import { PART_DEFS } from "./partDefs";
import { applyTaper, type TaperType } from "./taper";
import type { Netlist, NodeId } from "../core/solver/types";
import { GROUND } from "../core/solver/types";
import type { BlockCategory, BlockInstance, BlockParam, BlockPort, PartInstance, PortKind, TerminalRef, Wire } from "./types";

/**
 * A real knob hidden inside a netlist. Netlists only know resistors, so presets and blocks describe
 * a pot as the two resistors either side of its wiper, or a variable resistor as one resistor and
 * its maximum. On the canvas these become one potentiometer part the user can turn - which is what
 * lets a black-box block show "DRIVE" and "TONE" instead of "Rf = 500kΩ".
 */
export type KnobSpec =
  | {
      kind: "pot";
      /** Part id of the potentiometer on the canvas (e.g. "TONE"). */
      id: string;
      label: string;
      /** Resistor between the pot's "a" lug and the wiper. */
      upper: string;
      /** Resistor between the wiper and the "b" lug. Must share exactly one node with `upper`. */
      lower: string;
      taper?: TaperType;
    }
  | {
      kind: "rheostat";
      id: string;
      label: string;
      /** The resistor whose value the knob sets; its first node becomes lug "a", its second the wiper. */
      element: string;
      maxResistance: number;
      taper?: TaperType;
      /** Wire it the other way round, so turning up *lowers* the resistance (e.g. a series tone
       * control where clockwise should be brighter). */
      reverse?: boolean;
    };

export interface PortSpec {
  kind: PortKind;
  /** Node of the netlist the port exposes. */
  node: NodeId;
  label?: string;
  id?: string;
}

/** One functional block within a netlist: which elements belong to it and where it connects out. */
export interface BlockAnnotation {
  id: string;
  label: string;
  category: BlockCategory;
  /** Netlist element ids (before knob conversion - a converted resistor's knob joins its block). */
  elements: string[];
  ports: PortSpec[];
  collapsed?: boolean;
}

export interface AnnotatedCircuitInput {
  netlist: Netlist;
  inputSourceId?: string;
  layout?: Record<string, { x: number; y: number }>;
  blocks?: BlockAnnotation[];
  knobs?: KnobSpec[];
  /** Nodes whose canvas location the caller needs afterwards (output, probe taps). */
  nodesOfInterest?: NodeId[];
}

export interface AnnotatedCircuit {
  parts: PartInstance[];
  wires: Wire[];
  blocks: BlockInstance[];
  /** A terminal on each requested node - preferring parts that are not ground symbols. */
  nodeTerminals: Map<NodeId, TerminalRef>;
}

const PORT_LABEL: Record<PortKind, string> = { in: "IN", out: "OUT", supply: "V+", bias: "BIAS", ground: "GND", aux: "AUX" };

/** Wiper position that gives `ratio` of the track between lug "a" and the wiper, for any taper. */
export function invertTaper(taper: TaperType, ratio: number): number {
  const target = Math.min(Math.max(ratio, 0), 1);
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (applyTaper(taper, mid) < target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

const refKey = (r: TerminalRef) => `${r.partId}:${r.terminalId}`;

/**
 * Lays a netlist out on the canvas and applies its annotations: blocks (membership, ports, knobs)
 * and knob conversion. Used for both pedal presets and library blocks, so a preset's "gain stage"
 * and the library's gain-stage block come out the same way.
 */
export function buildAnnotatedCircuit(input: AnnotatedCircuitInput): AnnotatedCircuit {
  const { netlist } = input;
  const graph = graphFromNetlist(netlist, input.inputSourceId, input.layout);
  let parts = graph.parts;
  let wires = graph.wires;
  const knobs = input.knobs ?? [];
  const elementById = new Map(netlist.elements.map((e) => [e.id, e]));

  // --- block membership (ground symbols follow the part they serve) -----------------------------
  const blockOfElement = new Map<string, string>();
  for (const b of input.blocks ?? []) for (const id of b.elements) blockOfElement.set(id, b.id);
  parts = parts.map((p) => {
    const owner = graph.groundOwners.get(p.id) ?? p.id;
    const blockId = blockOfElement.get(owner);
    return blockId ? { ...p, blockId } : p;
  });

  // --- a terminal for a node, optionally restricted to a set of parts ----------------------------
  const knobElements = new Set(knobs.flatMap((k) => (k.kind === "pot" ? [k.upper, k.lower] : [k.element])));
  const terminalForNode = (node: NodeId, allowed?: (elementId: string) => boolean): TerminalRef | null => {
    let fallback: TerminalRef | null = null;
    for (const el of netlist.elements) {
      if (allowed && !allowed(el.id)) continue;
      const i = el.nodes.indexOf(node);
      if (i < 0) continue;
      const ref = { partId: el.id, terminalId: PART_DEFS[el.type].terminals[i].id };
      // Prefer a terminal that survives knob conversion; a converted one is remapped below anyway.
      if (!knobElements.has(el.id)) return ref;
      fallback ??= ref;
    }
    return fallback;
  };

  const nodeTerminals = new Map<NodeId, TerminalRef>();
  for (const node of input.nodesOfInterest ?? []) {
    const ref = terminalForNode(node);
    if (ref) nodeTerminals.set(node, ref);
  }

  const blocks: BlockInstance[] = (input.blocks ?? []).map((b) => {
    const members = new Set(b.elements);
    const used = new Map<PortKind, number>();
    const ports: BlockPort[] = [];
    for (const spec of b.ports) {
      if (spec.node === GROUND) continue;
      const terminal = terminalForNode(spec.node, (id) => members.has(id));
      if (!terminal) throw new Error(`block ${b.id}: no member terminal on port node "${spec.node}"`);
      const n = (used.get(spec.kind) ?? 0) + 1;
      used.set(spec.kind, n);
      ports.push({
        id: spec.id ?? (n === 1 ? spec.kind : `${spec.kind}${n}`),
        label: spec.label ?? (n === 1 ? PORT_LABEL[spec.kind] : `${PORT_LABEL[spec.kind]}${n}`),
        kind: spec.kind,
        terminal,
      });
    }
    return { id: b.id, defId: null, label: b.label, category: b.category, ports, params: [], collapsed: b.collapsed ?? false };
  });

  // --- knob conversion --------------------------------------------------------------------------
  const remap = new Map<string, TerminalRef>();
  const extraWires: Wire[] = [];
  for (const knob of knobs) {
    if (knob.kind === "pot") {
      const upper = elementById.get(knob.upper);
      const lower = elementById.get(knob.lower);
      if (upper?.type !== "resistor" || lower?.type !== "resistor") throw new Error(`knob ${knob.id}: pot halves must be resistors`);
      const shared = upper.nodes.filter((n) => lower.nodes.includes(n));
      if (shared.length !== 1) throw new Error(`knob ${knob.id}: pot halves must share exactly one node (the wiper)`);
      const wiper = shared[0];
      const ui = upper.nodes.indexOf(wiper);
      const li = lower.nodes.indexOf(wiper);
      const t = ["a", "b"];
      remap.set(`${upper.id}:${t[ui]}`, { partId: knob.id, terminalId: "wiper" });
      remap.set(`${upper.id}:${t[1 - ui]}`, { partId: knob.id, terminalId: "a" });
      remap.set(`${lower.id}:${t[li]}`, { partId: knob.id, terminalId: "wiper" });
      remap.set(`${lower.id}:${t[1 - li]}`, { partId: knob.id, terminalId: "b" });
      const total = upper.resistance + lower.resistance;
      const taper = knob.taper ?? "B";
      const host = parts.find((p) => p.id === upper.id)!;
      parts = parts.filter((p) => p.id !== upper.id && p.id !== lower.id);
      parts.push({
        id: knob.id,
        type: "potentiometer",
        x: host.x,
        y: host.y,
        rotation: 0,
        params: { resistance: total, position: invertTaper(taper, upper.resistance / total), taper },
        ...(host.blockId ? { blockId: host.blockId } : {}),
      });
    } else {
      const el = elementById.get(knob.element);
      if (el?.type !== "resistor") throw new Error(`knob ${knob.id}: rheostat element must be a resistor`);
      const end = knob.reverse ? "b" : "a";
      const tied = knob.reverse ? "a" : "b";
      remap.set(`${el.id}:a`, { partId: knob.id, terminalId: end });
      remap.set(`${el.id}:b`, { partId: knob.id, terminalId: "wiper" });
      const taper = knob.taper ?? "B";
      const fraction = el.resistance / knob.maxResistance;
      const host = parts.find((p) => p.id === el.id)!;
      parts = parts.filter((p) => p.id !== el.id);
      parts.push({
        id: knob.id,
        type: "potentiometer",
        x: host.x,
        y: host.y,
        rotation: 0,
        params: { resistance: knob.maxResistance, position: invertTaper(taper, knob.reverse ? 1 - fraction : fraction), taper },
        ...(host.blockId ? { blockId: host.blockId } : {}),
      });
      // A variable resistor is a pot with its unused lug tied to the wiper - the usual DIY wiring.
      extraWires.push({ id: `${knob.id}_tie`, a: { partId: knob.id, terminalId: "wiper" }, b: { partId: knob.id, terminalId: tied } });
    }
    const potBlock = parts.find((p) => p.id === knob.id)!.blockId;
    const block = blocks.find((b) => b.id === potBlock);
    if (block) block.params.push({ id: `${knob.id}.position`, label: knob.label, partId: knob.id, paramKey: "position" } satisfies BlockParam);
  }

  if (remap.size > 0) {
    const apply = (r: TerminalRef) => remap.get(refKey(r)) ?? r;
    wires = wires
      .map((w) => ({ ...w, a: apply(w.a), b: apply(w.b) }))
      .filter((w) => refKey(w.a) !== refKey(w.b));
    for (const block of blocks) block.ports = block.ports.map((p) => ({ ...p, terminal: apply(p.terminal) }));
    for (const [node, ref] of nodeTerminals) nodeTerminals.set(node, apply(ref));
  }
  wires = [...wires, ...extraWires];

  return { parts, wires, blocks, nodeTerminals };
}
