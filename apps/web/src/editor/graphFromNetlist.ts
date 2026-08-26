import type { Netlist, NodeId } from "../core/solver/types";
import { GROUND } from "../core/solver/types";
import { PART_DEFS } from "./partDefs";
import type { PartInstance, TerminalRef, Wire } from "./types";

const COLUMN_SPACING = 170;
const ROW_SPACING = 150;
const ORIGIN_X = 100;
const ORIGIN_Y = 100;
const GROUND_PART_ID = "GND";

/** BFS distance from the input source, hopping over any node the two elements share except ground - a rough stand-in for "how far downstream is this part". */
function computeSignalDepth(netlist: Netlist, rootId: string | undefined): Map<string, number> {
  const neighbors = new Map<string, Set<string>>();
  for (const el of netlist.elements) neighbors.set(el.id, new Set());

  const elementsByNode = new Map<NodeId, string[]>();
  for (const el of netlist.elements) {
    for (const node of el.nodes) {
      if (node === GROUND) continue;
      if (!elementsByNode.has(node)) elementsByNode.set(node, []);
      elementsByNode.get(node)!.push(el.id);
    }
  }
  for (const ids of elementsByNode.values()) {
    for (const a of ids) for (const b of ids) if (a !== b) neighbors.get(a)!.add(b);
  }

  const depth = new Map<string, number>();
  const root = rootId && neighbors.has(rootId) ? rootId : netlist.elements[0]?.id;
  if (!root) return depth;

  depth.set(root, 0);
  const queue = [root];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const next of neighbors.get(current) ?? []) {
      if (depth.has(next)) continue;
      depth.set(next, depth.get(current)! + 1);
      queue.push(next);
    }
  }

  // Anything unreachable (a separate island) still needs a column - tack it on after the deepest reached part.
  const maxDepth = Math.max(0, ...depth.values());
  for (const el of netlist.elements) if (!depth.has(el.id)) depth.set(el.id, maxDepth + 1);
  return depth;
}

/**
 * Reconstructs a placeable part/wire graph from a netlist (e.g. a preset), so
 * a template can be "loaded" straight into the schematic canvas instead of
 * living in a separate read-only view. Parts are arranged left-to-right by
 * BFS distance from the input source (a rough stand-in for signal flow) so
 * wiring mostly runs forward instead of zig-zagging across the whole canvas;
 * it's still not a hand-tuned schematic, but it reads far better than a
 * plain declaration-order grid. Ground gets its own row below everything.
 */
export function graphFromNetlist(netlist: Netlist, inputSourceId?: string): { parts: PartInstance[]; wires: Wire[] } {
  const depth = computeSignalDepth(netlist, inputSourceId);
  const rowCountByColumn = new Map<number, number>();
  const parts: PartInstance[] = [];

  for (const element of netlist.elements) {
    const column = depth.get(element.id) ?? 0;
    const row = rowCountByColumn.get(column) ?? 0;
    rowCountByColumn.set(column, row + 1);

    const { id, type, nodes: _nodes, ...rest } = element;
    void _nodes;
    parts.push({
      id,
      type,
      x: ORIGIN_X + column * COLUMN_SPACING,
      y: ORIGIN_Y + row * ROW_SPACING,
      rotation: 0,
      params: rest as PartInstance["params"],
    });
  }

  const usesGround = netlist.elements.some((el) => el.nodes.includes(GROUND));
  if (usesGround) {
    const columns = Math.max(0, ...rowCountByColumn.keys());
    const maxRows = Math.max(1, ...rowCountByColumn.values());
    parts.push({
      id: GROUND_PART_ID,
      type: "ground",
      x: ORIGIN_X + (columns / 2) * COLUMN_SPACING,
      y: ORIGIN_Y + maxRows * ROW_SPACING,
      rotation: 0,
      params: {},
    });
  }

  const partById = new Map(parts.map((p) => [p.id, p]));
  const terminalsByNode = new Map<NodeId, TerminalRef[]>();
  const addTerminal = (node: NodeId, ref: TerminalRef) => {
    if (!terminalsByNode.has(node)) terminalsByNode.set(node, []);
    terminalsByNode.get(node)!.push(ref);
  };

  for (const element of netlist.elements) {
    const terminals = PART_DEFS[element.type].terminals;
    element.nodes.forEach((node, i) => addTerminal(node, { partId: element.id, terminalId: terminals[i].id }));
  }
  if (usesGround) addTerminal(GROUND, { partId: GROUND_PART_ID, terminalId: "gnd" });

  const wires: Wire[] = [];
  let wireCount = 0;
  for (const refs of terminalsByNode.values()) {
    // Chain in layout order (left-to-right, then top-to-bottom) so each wire connects
    // geometrically nearby parts instead of whatever order they appeared in the netlist.
    const sorted = [...refs].sort((a, b) => {
      const pa = partById.get(a.partId)!;
      const pb = partById.get(b.partId)!;
      return pa.x - pb.x || pa.y - pb.y;
    });
    for (let i = 1; i < sorted.length; i++) {
      wires.push({ id: `w${wireCount++}`, a: sorted[i - 1], b: sorted[i] });
    }
  }

  return { parts, wires };
}

/**
 * After round-tripping a netlist through `graphFromNetlist` and back through
 * `netlistFromGraph`, node names are reassigned (n1, n2, ...). This finds the
 * new name for whatever node used to be `originalNode`, by following the
 * same (elementId, terminal-index) pair through both netlists.
 */
export function findEquivalentNode(original: Netlist, originalNode: NodeId, roundTripped: Netlist): NodeId | null {
  for (const element of original.elements) {
    const index = element.nodes.indexOf(originalNode);
    if (index === -1) continue;
    const match = roundTripped.elements.find((e) => e.id === element.id);
    if (match) return match.nodes[index];
  }
  return null;
}
