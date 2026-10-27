import type { Netlist, NodeId } from "../core/solver/types";
import { GROUND } from "../core/solver/types";
import { PART_DEFS } from "./partDefs";
import type { PartInstance, TerminalRef, Wire } from "./types";

const COLUMN_SPACING = 170;
const ROW_SPACING = 150;
const ORIGIN_X = 100;
const ORIGIN_Y = 100;
const GROUND_ID_PREFIX = "GND";
/** Vertical offset from an owning part's center to its local ground symbol - far enough to clear
 * the owner's own body (drawn ~38px tall) and its terminal leads before the ground triangle starts. */
const GROUND_LOCAL_OFFSET_Y = 70;

/** 2-terminal element types whose two nodes are drawn on opposite sides (terminal "a" at dx=-30,
 * "b" at dx=+30 - see partDefs.ts) - the only types `orientTwoTerminal` below knows how to flip. */
const TWO_TERMINAL_TYPES = new Set(["resistor", "capacitor", "inductor", "diode"]);

/**
 * A 2-terminal part whose first-listed node is ground gets rotated 180 degrees, moving its OTHER
 * (non-ground) terminal from the right side to the left. Ground connections are always short local
 * hops (see GROUND_LOCAL_OFFSET_Y) regardless of which side they're drawn on, so this costs nothing
 * there - but it matters a lot for the non-ground terminal, which otherwise ends up facing away from
 * whatever hub node it needs to reach. Concretely: a symmetric diode clipper's two antiparallel
 * diodes (D1: anode->signal, cathode->gnd; D2: anode->gnd, cathode->signal) both default to the same
 * left-anode/right-cathode orientation, so D2's signal-side terminal (its cathode) ends up on the
 * right, forcing its wire to loop all the way around both diode bodies to reach the signal node on
 * the left. Rotating D2 puts its cathode on the left instead, next to the node it actually connects to.
 */
function orientTwoTerminal(type: string, nodes: NodeId[]): 0 | 180 {
  if (!TWO_TERMINAL_TYPES.has(type)) return 0;
  return nodes[0] === GROUND ? 180 : 0;
}

/** Elements that share a (non-ground) net with each other, keyed by element id - the adjacency used by both column and row placement. */
function buildNeighborMap(netlist: Netlist): Map<string, Set<string>> {
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
  return neighbors;
}

/** BFS distance from the input source, hopping over any node the two elements share except ground - a rough stand-in for "how far downstream is this part". */
function computeSignalDepth(netlist: Netlist, rootId: string | undefined, neighbors: Map<string, Set<string>>): Map<string, number> {
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
 * Assigns a row (vertical slot) to every element within its column, using the standard
 * "barycenter heuristic" from layered graph drawing (Sugiyama-style): repeatedly re-sort each
 * column's elements by the average row of their already-placed neighbors in adjacent columns,
 * alternating left-to-right and right-to-left passes. This tends to pull electrically-connected
 * parts onto the same row and pushes unrelated branches apart, which cuts down on wires crossing
 * through unrelated components - a first-declaration-order row assignment has no such preference.
 */
function assignRows(netlist: Netlist, depth: Map<string, number>, neighbors: Map<string, Set<string>>): Map<string, number> {
  const byColumn = new Map<number, string[]>();
  for (const el of netlist.elements) {
    const column = depth.get(el.id) ?? 0;
    if (!byColumn.has(column)) byColumn.set(column, []);
    byColumn.get(column)!.push(el.id);
  }
  const columns = [...byColumn.keys()].sort((a, b) => a - b);

  const rowOf = new Map<string, number>();
  for (const column of columns) byColumn.get(column)!.forEach((id, i) => rowOf.set(id, i));

  const ITERATIONS = 4;
  for (let iter = 0; iter < ITERATIONS; iter++) {
    const passOrder = iter % 2 === 0 ? columns : [...columns].reverse();
    for (const column of passOrder) {
      const ids = byColumn.get(column)!;
      const barycenterOf = new Map<string, number>();
      for (const id of ids) {
        const neighborRows = [...(neighbors.get(id) ?? [])].map((n) => rowOf.get(n)).filter((r): r is number => r !== undefined);
        barycenterOf.set(id, neighborRows.length > 0 ? neighborRows.reduce((a, b) => a + b, 0) / neighborRows.length : rowOf.get(id)!);
      }
      ids.sort((a, b) => barycenterOf.get(a)! - barycenterOf.get(b)!);
      ids.forEach((id, i) => rowOf.set(id, i));
    }
  }
  return rowOf;
}

/**
 * Reconstructs a placeable part/wire graph from a netlist (e.g. a preset), so
 * a template can be "loaded" straight into the schematic canvas instead of
 * living in a separate read-only view. Parts are arranged left-to-right by
 * BFS distance from the input source (a rough stand-in for signal flow), and
 * top-to-bottom within each column by a barycenter heuristic that pulls
 * connected parts onto shared rows to reduce wire crossings; it's still not
 * a hand-tuned schematic, but it reads far better than a plain
 * declaration-order grid. Every grounded terminal gets its own local ground
 * symbol placed right beside its owner (the paper-schematic convention) -
 * `netlistFromGraph` unions every "ground"-type part together regardless of
 * id, so any number of instances is electrically equivalent to one shared
 * node. This replaced routing every grounded terminal to a single shared
 * ground part far away on the sheet, which produced long round-trip wires.
 */
export function graphFromNetlist(
  netlist: Netlist,
  inputSourceId?: string,
  layout?: Record<string, { x: number; y: number }>,
): { parts: PartInstance[]; wires: Wire[]; groundOwners: Map<string, string> } {
  const neighbors = buildNeighborMap(netlist);
  const depth = computeSignalDepth(netlist, inputSourceId, neighbors);
  const rowOf = assignRows(netlist, depth, neighbors);
  const parts: PartInstance[] = [];

  for (const element of netlist.elements) {
    const column = depth.get(element.id) ?? 0;
    const row = rowOf.get(element.id) ?? 0;

    const { id, type, nodes, ...rest } = element;
    const { role, ...params } = rest as Record<string, unknown> & { role?: PartInstance["role"] };
    const override = layout?.[id];
    parts.push({
      id,
      type,
      x: override?.x ?? ORIGIN_X + column * COLUMN_SPACING,
      y: override?.y ?? ORIGIN_Y + row * ROW_SPACING,
      rotation: orientTwoTerminal(type, nodes),
      params: params as PartInstance["params"],
      ...(role ? { role } : {}),
    });
  }

  const ownerById = new Map(parts.map((p) => [p.id, p]));
  const terminalsByNode = new Map<NodeId, TerminalRef[]>();
  const addTerminal = (node: NodeId, ref: TerminalRef) => {
    if (!terminalsByNode.has(node)) terminalsByNode.set(node, []);
    terminalsByNode.get(node)!.push(ref);
  };

  for (const element of netlist.elements) {
    const terminals = PART_DEFS[element.type].terminals;
    element.nodes.forEach((node, i) => addTerminal(node, { partId: element.id, terminalId: terminals[i].id }));
  }

  // Each element's grounded terminals connect only to that element's own local ground symbol. Every
  // ground symbol is the same net (netlistFromGraph unions them), so chaining all grounded
  // terminals together as well would add nothing electrically - and drew long wires across the
  // sheet between parts that merely share ground.
  const groundOwners = new Map<string, string>();
  const localGroundWires: [TerminalRef, TerminalRef][] = [];
  let groundIndex = 0;
  for (const element of netlist.elements) {
    if (!element.nodes.includes(GROUND)) continue;
    const owner = ownerById.get(element.id)!;
    const override = layout?.[element.id];
    // A layout override already fixes the owner's position (e.g. a saved custom arrangement) -
    // the local ground symbol should follow it there too, not the auto-computed grid slot.
    const ownerX = override?.x ?? owner.x;
    const ownerY = override?.y ?? owner.y;
    groundIndex += 1;
    const groundPartId = `${GROUND_ID_PREFIX}${groundIndex}`;
    parts.push({ id: groundPartId, type: "ground", x: ownerX, y: ownerY + GROUND_LOCAL_OFFSET_Y, rotation: 0, params: {} });
    groundOwners.set(groundPartId, element.id);
    const terminals = PART_DEFS[element.type].terminals;
    element.nodes.forEach((node, i) => {
      if (node === GROUND) localGroundWires.push([{ partId: groundPartId, terminalId: "gnd" }, { partId: element.id, terminalId: terminals[i].id }]);
    });
  }

  const partById = new Map(parts.map((p) => [p.id, p]));
  const wires: Wire[] = [];
  let wireCount = 0;
  for (const [a, b] of localGroundWires) wires.push({ id: `w${wireCount++}`, a, b });
  for (const [node, refs] of terminalsByNode) {
    if (node === GROUND) continue;
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

  return { parts, wires, groundOwners };
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
