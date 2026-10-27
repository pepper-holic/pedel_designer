import { graphFromNetlist } from "./graphFromNetlist";
import { PART_DEFS } from "./partDefs";
import { applyTaper, type TaperType } from "./taper";
import type { BlockAnnotation, KnobSpec } from "../core/library/types";
import type { Netlist, NodeId } from "../core/solver/types";
import { GROUND } from "../core/solver/types";
import type { BlockInstance, BlockParam, BlockPort, PartInstance, PortKind, TerminalRef, Wire } from "./types";

export type { KnobSpec, PortSpec, BlockAnnotation } from "../core/library/types";

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
  const blockOfElement = new Map<string, BlockAnnotation>();
  for (const b of input.blocks ?? []) for (const id of b.elements) blockOfElement.set(id, b);
  parts = parts.map((p) => {
    const owner = graph.groundOwners.get(p.id) ?? p.id;
    const block = blockOfElement.get(owner);
    if (!block) return p;
    // A source inside a power block is a supply rail, never the audio input.
    const role = block.category === "power" && p.type === "vsource" && !p.role ? { role: "supply" as const } : {};
    return { ...p, blockId: block.id, ...role };
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
      // A variant that drops the elements on this node simply has no such port.
      if (!terminal) continue;
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
    // Variants may drop a knob's resistor(s); the knob just does not exist in that build.
    if (knob.kind === "pot" ? !elementById.has(knob.upper) || !elementById.has(knob.lower) : !elementById.has(knob.element)) continue;
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
      const taper: TaperType = knob.taper ?? "B";
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
      const taper: TaperType = knob.taper ?? "B";
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
