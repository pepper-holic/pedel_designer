import { netlistFromGraph } from "./netlistFromGraph";
import { terminalPosition } from "./geometry";
import { PART_DEFS } from "./partDefs";
import type { CircuitSnapshot } from "./historyStack";
import type { BlockCategory, BlockInstance, BlockParam, BlockPort, PartInstance, PortKind, TerminalRef, Wire } from "./types";

/**
 * Pure operations on functional blocks. A block is bookkeeping over ordinary parts: membership
 * (`PartInstance.blockId`), named ports pointing at real internal terminals, and surfaced knobs.
 * Nothing here touches wires' endpoints - wires always join real terminals, which is what keeps
 * the netlist, DRC, KiCad export and sweeps unaware of blocks.
 */

const PORT_LABEL: Record<PortKind, string> = { in: "IN", out: "OUT", supply: "V+", bias: "BIAS", ground: "GND", aux: "AUX" };

export function membersOf(parts: PartInstance[], blockId: string): PartInstance[] {
  return parts.filter((p) => p.blockId === blockId);
}

function key(ref: TerminalRef): string {
  return `${ref.partId}:${ref.terminalId}`;
}

/**
 * Nets that cross the block boundary: reached by a member terminal and by a terminal of some
 * non-member, non-ground part. Ground never counts - every block reaches it through its own local
 * ground symbols, so it is not a connection that needs a pin. One representative member terminal
 * per net, preferring the leftmost so an input lands on the input side.
 */
export function boundaryTerminals(parts: PartInstance[], wires: Wire[], memberIds: Set<string>): Map<string, TerminalRef> {
  const { terminalNet } = netlistFromGraph(parts, wires);
  const outsideNets = new Set<string>();
  for (const part of parts) {
    if (memberIds.has(part.id) || part.type === "ground") continue;
    for (const t of PART_DEFS[part.type].terminals) outsideNets.add(terminalNet.get(`${part.id}:${t.id}`) ?? "");
  }
  const byNet = new Map<string, { ref: TerminalRef; x: number }>();
  for (const part of parts) {
    if (!memberIds.has(part.id)) continue;
    for (const t of PART_DEFS[part.type].terminals) {
      const net = terminalNet.get(`${part.id}:${t.id}`);
      if (!net || net === "0" || !outsideNets.has(net)) continue;
      const x = terminalPosition(part, t.id).x;
      const current = byNet.get(net);
      if (!current || x < current.x) byNet.set(net, { ref: { partId: part.id, terminalId: t.id }, x });
    }
  }
  return new Map([...byNet].map(([net, v]) => [net, v.ref]));
}

/**
 * Guesses a port for every boundary net. Supply rails are recognised by the source driving them;
 * the rest go by position - the leftmost is the input, the rightmost the output, anything else is
 * auxiliary. It is only a starting point: the block inspector lets the user re-kind and rename.
 */
export function extractPorts(parts: PartInstance[], wires: Wire[], memberIds: Set<string>): BlockPort[] {
  const boundary = boundaryTerminals(parts, wires, memberIds);
  if (boundary.size === 0) return [];
  const { terminalNet } = netlistFromGraph(parts, wires);
  const supplyNets = new Set<string>();
  for (const part of parts) {
    if (memberIds.has(part.id) || part.type !== "vsource") continue;
    if (part.role === "supply" || part.role === "bias") supplyNets.add(terminalNet.get(`${part.id}:positive`) ?? "");
  }

  const byId = new Map(parts.map((p) => [p.id, p]));
  const entries = [...boundary].map(([net, ref]) => ({ net, ref, x: terminalPosition(byId.get(ref.partId)!, ref.terminalId).x }));
  const signal = entries.filter((e) => !supplyNets.has(e.net)).sort((a, b) => a.x - b.x);
  const kinds = new Map<string, PortKind>();
  for (const e of entries) if (supplyNets.has(e.net)) kinds.set(e.net, "supply");
  if (signal.length === 1) kinds.set(signal[0].net, "in");
  else if (signal.length >= 2) {
    signal.forEach((e, i) => kinds.set(e.net, i === 0 ? "in" : i === signal.length - 1 ? "out" : "aux"));
  }

  const used = new Map<PortKind, number>();
  return [...signal, ...entries.filter((e) => supplyNets.has(e.net))].map((e) => {
    const kind = kinds.get(e.net)!;
    const n = (used.get(kind) ?? 0) + 1;
    used.set(kind, n);
    const id = n === 1 ? kind : `${kind}${n}`;
    return { id, label: n === 1 ? PORT_LABEL[kind] : `${PORT_LABEL[kind]}${n}`, kind, terminal: { ...e.ref } };
  });
}

/** Knobs worth surfacing by default: every pot's position and every switch's position. */
export function defaultBlockParams(members: PartInstance[]): BlockParam[] {
  const params: BlockParam[] = [];
  for (const part of members) {
    if (part.type === "potentiometer") params.push({ id: `${part.id}.position`, label: part.id, partId: part.id, paramKey: "position" });
    else if ("switchPosition" in part.params) params.push({ id: `${part.id}.switchPosition`, label: part.id, partId: part.id, paramKey: "switchPosition" });
  }
  return params;
}

/** Ports and knobs that still point at existing parts. Run after anything that deletes parts. */
export function pruneBlocks(snapshot: CircuitSnapshot): CircuitSnapshot {
  const partIds = new Set(snapshot.parts.map((p) => p.id));
  const used = new Set(snapshot.parts.map((p) => p.blockId).filter((id): id is string => !!id));
  let changed = false;
  const blocks = snapshot.blocks
    .filter((b) => used.has(b.id) || ((changed = true), false))
    .map((b) => {
      const ports = b.ports.filter((p) => partIds.has(p.terminal.partId));
      const params = b.params.filter((p) => partIds.has(p.partId));
      if (ports.length === b.ports.length && params.length === b.params.length) return b;
      changed = true;
      return { ...b, ports, params };
    });
  return changed ? { ...snapshot, blocks } : snapshot;
}

/**
 * Groups parts into a new block (Ctrl+G). Parts already in another block move into this one; a
 * block left empty by that disappears. Ports are extracted from what currently crosses the new
 * boundary, knobs from the pots and switches inside.
 */
export function groupParts(
  snapshot: CircuitSnapshot,
  memberIds: string[],
  options: { id: string; label: string; category?: BlockCategory },
): CircuitSnapshot {
  const members = new Set(memberIds.filter((id) => snapshot.parts.some((p) => p.id === id)));
  if (members.size === 0) return snapshot;
  const parts = snapshot.parts.map((p) => (members.has(p.id) ? { ...p, blockId: options.id } : p));
  const block: BlockInstance = {
    id: options.id,
    defId: null,
    label: options.label,
    category: options.category ?? "custom",
    ports: extractPorts(parts, snapshot.wires, members),
    params: defaultBlockParams(parts.filter((p) => members.has(p.id))),
    collapsed: false,
  };
  return pruneBlocks({ parts, wires: snapshot.wires, blocks: [...snapshot.blocks, block] });
}

/** Dissolves a block (Ctrl+Shift+G): its parts become ordinary loose parts again, wires untouched. */
export function ungroupBlock(snapshot: CircuitSnapshot, blockId: string): CircuitSnapshot {
  return {
    parts: snapshot.parts.map((p) => {
      if (p.blockId !== blockId) return p;
      const loose = { ...p };
      delete loose.blockId;
      return loose;
    }),
    wires: snapshot.wires,
    blocks: snapshot.blocks.filter((b) => b.id !== blockId),
  };
}

/**
 * Collapses or expands a block. Collapsing first makes sure every net crossing the boundary has a
 * port - a wire that was added to an internal terminal after the block was made would otherwise be
 * drawn to nowhere once the parts are hidden.
 */
export function setBlockCollapsed(snapshot: CircuitSnapshot, blockId: string, collapsed: boolean): CircuitSnapshot {
  const block = snapshot.blocks.find((b) => b.id === blockId);
  if (!block || block.collapsed === collapsed) return snapshot;
  let ports = block.ports;
  if (collapsed) {
    const members = new Set(membersOf(snapshot.parts, blockId).map((p) => p.id));
    const { terminalNet } = netlistFromGraph(snapshot.parts, snapshot.wires);
    const covered = new Set(ports.map((p) => terminalNet.get(key(p.terminal))));
    const missing = [...boundaryTerminals(snapshot.parts, snapshot.wires, members)].filter(([net]) => !covered.has(net));
    if (missing.length > 0) {
      let n = ports.filter((p) => p.kind === "aux").length;
      ports = [
        ...ports,
        ...missing.map(([, ref]) => {
          n++;
          return { id: `aux${n}`, label: `AUX${n}`, kind: "aux" as const, terminal: { ...ref } };
        }),
      ];
    }
  }
  return { ...snapshot, blocks: snapshot.blocks.map((b) => (b.id === blockId ? { ...b, collapsed, ports } : b)) };
}

export function updateBlock(snapshot: CircuitSnapshot, blockId: string, patch: Partial<Pick<BlockInstance, "label" | "category" | "ports" | "params">>): CircuitSnapshot {
  return { ...snapshot, blocks: snapshot.blocks.map((b) => (b.id === blockId ? { ...b, ...patch } : b)) };
}

/** Collapsed blocks' members: hidden on the canvas, reached only through the block's box. */
export function hiddenPartBlocks(parts: PartInstance[], blocks: BlockInstance[]): Map<string, BlockInstance> {
  const collapsed = new Map(blocks.filter((b) => b.collapsed).map((b) => [b.id, b]));
  const hidden = new Map<string, BlockInstance>();
  for (const p of parts) {
    const block = p.blockId ? collapsed.get(p.blockId) : undefined;
    if (block) hidden.set(p.id, block);
  }
  return hidden;
}

/**
 * Copy/paste for parts that may belong to blocks. A block copied whole comes along as a new block
 * (its ports and knobs re-pointed at the copies); a block copied only in part does not - those
 * copies arrive as loose parts, since half a block's ports would point at parts left behind.
 */
export function cloneBlocksForCopies(
  sourceBlocks: BlockInstance[],
  sourceParts: PartInstance[],
  copiedIds: Set<string>,
  copyId: (originalId: string) => string,
  blockIdPrefix: string,
): { blocks: BlockInstance[]; blockIdFor: (originalBlockId: string | undefined) => string | undefined } {
  const whole = new Map<string, string>();
  for (const block of sourceBlocks) {
    const members = sourceParts.filter((p) => p.blockId === block.id);
    if (members.length > 0 && members.every((p) => copiedIds.has(p.id))) whole.set(block.id, `${blockIdPrefix}_${block.id}`);
  }
  const blocks = sourceBlocks
    .filter((b) => whole.has(b.id))
    .map((b) => ({
      ...b,
      id: whole.get(b.id)!,
      ports: b.ports.map((p) => ({ ...p, terminal: { partId: copyId(p.terminal.partId), terminalId: p.terminal.terminalId } })),
      params: b.params.map((p) => ({ ...p, partId: copyId(p.partId) })),
    }));
  return { blocks, blockIdFor: (id) => (id ? whole.get(id) : undefined) };
}

/** "DRIVE 70%", "SW #1", "R 47kΩ"-style readout of a surfaced knob. */
export function knobReadout(part: PartInstance | undefined, paramKey: string): string {
  const v = part?.params[paramKey];
  if (typeof v !== "number") return String(v ?? "-");
  if (paramKey === "position") return `${Math.round(v * 100)}%`;
  if (paramKey === "switchPosition") return `#${v}`;
  const abs = Math.abs(v);
  if (abs >= 1e6) return `${+(v / 1e6).toPrecision(3)}M`;
  if (abs >= 1e3) return `${+(v / 1e3).toPrecision(3)}k`;
  if (abs > 0 && abs < 1e-6) return `${+(v * 1e9).toPrecision(3)}n`;
  return `${+v.toPrecision(3)}`;
}
