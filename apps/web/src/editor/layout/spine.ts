import type { Adjacency } from "./layered";

export interface SpineInput {
  members: string[];
  /** Member-to-member adjacency inside the group (shared non-supply, non-ground nets). */
  adjacency: Adjacency;
  /** Where the signal enters the group (input-port parts, or parts touching an upstream group). */
  entries: string[];
  /** Where it leaves (output-port parts, or parts touching a downstream group). */
  exits: string[];
  touchesGround: (id: string) => boolean;
  touchesSupply: (id: string) => boolean;
  /** Tie-breaker so the result is stable: e.g. the part's current x. */
  order: (a: string, b: string) => number;
  /** How much a part costs on the spine: low for amplifying devices, which is where the signal
   * really goes; high for diodes, which almost always hang off the path rather than carry it. */
  weight: (id: string) => number;
}

/** Most parts a stack may hold above or below one spine column before it spills into the next. */
const MAX_STACK = 2;

/** Column and row of every member; row 0 is the spine, negative rows are above it. */
export type SpinePlacement = Map<string, { col: number; row: number }>;

/** Cheapest path (sum of part weights) from any entry to any exit - Dijkstra on a small graph. */
function cheapestPath(from: string[], to: Set<string>, adjacency: Adjacency, weight: (id: string) => number): string[] {
  const dist = new Map<string, number>();
  const prev = new Map<string, string | null>();
  for (const f of from) {
    dist.set(f, weight(f));
    prev.set(f, null);
  }
  const done = new Set<string>();
  for (;;) {
    let cur: string | null = null;
    for (const [id, d] of dist) if (!done.has(id) && (cur === null || d < dist.get(cur)!)) cur = id;
    if (cur === null) return from.slice(0, 1);
    if (to.has(cur)) {
      const path: string[] = [];
      for (let p: string | null = cur; p !== null; p = prev.get(p)!) path.push(p);
      return path.reverse();
    }
    done.add(cur);
    for (const n of adjacency.get(cur) ?? []) {
      const d = dist.get(cur)! + weight(n);
      if (d < (dist.get(n) ?? Infinity)) {
        dist.set(n, d);
        prev.set(n, cur);
      }
    }
  }
}

/**
 * Lays a block out the way a schematic is drawn by hand: the signal's path from input to output on
 * one row (the spine), feedback and supply parts stacked above the spine part they hang off, and
 * grounded parts (bias resistors, bypass caps, shunt diodes) stacked below.
 *
 * A plain layered layout puts every part one hop from the input in the same column - which for an
 * op-amp stage is the feedback resistor, both clipping diodes and the op-amp itself, one above the
 * other, with the signal path lost in the middle of the stack.
 */
export function spineLayout(input: SpineInput): SpinePlacement {
  const { members, adjacency, order } = input;
  const sorted = [...members].sort(order);
  const entries = input.entries.length > 0 ? [...input.entries].sort(order) : sorted.slice(0, 1);
  const exits = new Set(input.exits.length > 0 ? input.exits : sorted.slice(-1));
  const spine = cheapestPath(entries, exits, adjacency, input.weight);

  const placement: SpinePlacement = new Map();
  spine.forEach((id, i) => placement.set(id, { col: i, row: 0 }));
  const above = new Map<number, number>();
  const below = new Map<number, number>();

  // Place the rest outward from the spine, nearest first, each over/under the mean column of its
  // already-placed neighbours.
  const pending = sorted.filter((id) => !placement.has(id));
  while (pending.length > 0) {
    let pickIndex = pending.findIndex((id) => [...(adjacency.get(id) ?? [])].some((n) => placement.has(n)));
    if (pickIndex < 0) pickIndex = 0; // a part with no placed neighbour (an island): just put it somewhere
    const id = pending.splice(pickIndex, 1)[0];
    const cols = [...(adjacency.get(id) ?? [])].map((n) => placement.get(n)?.col).filter((c): c is number => c !== undefined);
    const col = cols.length > 0 ? Math.round(cols.reduce((a, b) => a + b, 0) / cols.length) : spine.length;
    const down = input.touchesGround(id) && !input.touchesSupply(id);
    const stacks = down ? below : above;
    // Spill into the next column rather than growing one tower - a block stays roughly as wide as it
    // is tall instead of becoming a column of bypass caps and diodes.
    let c = col;
    while ((stacks.get(c) ?? 0) >= MAX_STACK) c++;
    const depth = (stacks.get(c) ?? 0) + 1;
    stacks.set(c, depth);
    placement.set(id, { col: c, row: down ? depth : -depth });
  }
  return placement;
}
