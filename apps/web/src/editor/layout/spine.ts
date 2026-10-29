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
  /** Which side of `neighbour` the part `id` attaches to: -1 for a pin on its left (its input side,
   * e.g. a transistor's base), +1 for its right, 0 for the middle or unknown. A bias network on the
   * input side of a device belongs in the column before it, the way a hand-drawn stage puts the base
   * divider over and under the coupling cap - not in a tower on top of the device itself. */
  sideOf?: (id: string, neighbour: string) => -1 | 0 | 1;
  /** How far (px) the pin of `neighbour` that `id` is wired to sits from the neighbour's centre,
   * along the row; 0 when unknown. A part stacked over or under a signal-row part is slid to that
   * pin's x so its wire drops straight onto the pin - the collector resistor right above the
   * collector, the base divider right above the coupling cap's output pin. */
  attachX?: (id: string, neighbour: string) => number;
  /** The group's amplifying devices (op-amps, transistors). The signal path is drawn THROUGH them,
   * in order from the entry: a feedback element joins an amplifier's input to its output, so the
   * cheapest entry-to-exit path would happily skip the amplifier and run along the feedback instead. */
  amplifiers?: string[];
}

/** Most parts a stack may hold above or below one spine column before it spills into the next. */
const MAX_STACK = 2;

/** Where a member goes inside its group: a column and a row on the group's grid, plus an optional
 * pixel nudge off that grid point (a pin that must land exactly on the spine row, a rung ladder
 * tighter than the row pitch). Row 0 is the spine, negative rows are above it. */
export interface Placement {
  col: number;
  row: number;
  dx?: number;
  dy?: number;
}

export type SpinePlacement = Map<string, Placement>;

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

/** Entry -> nearest amplifier -> next nearest -> ... -> exit, each leg the cheapest path; null when
 * some amplifier cannot be reached that way (the caller then takes the plain cheapest path). */
function pathThroughAmplifiers(entries: string[], exits: Set<string>, amplifiers: string[], adjacency: Adjacency, weight: (id: string) => number): string[] | null {
  if (amplifiers.length === 0) return null;
  const path: string[] = [];
  let from = entries;
  const remaining = new Set(amplifiers);
  const append = (leg: string[]) => {
    for (const id of leg) if (path[path.length - 1] !== id) path.push(id);
  };
  while (remaining.size > 0) {
    const leg = cheapestPath(from, remaining, adjacency, weight);
    const reached = leg[leg.length - 1];
    if (!remaining.has(reached)) return null;
    append(leg);
    remaining.delete(reached);
    from = [reached];
  }
  const last = cheapestPath(from, exits, adjacency, weight);
  if (!exits.has(last[last.length - 1])) return null;
  append(last);
  return path;
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
  const spine = pathThroughAmplifiers(entries, exits, input.amplifiers ?? [], adjacency, input.weight) ?? cheapestPath(entries, exits, adjacency, input.weight);

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
    const cols = [...(adjacency.get(id) ?? [])]
      .filter((n) => placement.has(n))
      .map((n) => placement.get(n)!.col + (input.sideOf?.(id, n) === -1 ? -1 : 0));
    const col = cols.length > 0 ? Math.round(cols.reduce((a, b) => a + b, 0) / cols.length) : spine.length;
    const down = input.touchesGround(id) && !input.touchesSupply(id);
    const stacks = down ? below : above;
    const myNeighbours = adjacency.get(id) ?? new Set<string>();
    // A part sharing a net directly with something already stacked in this column (e.g. the two
    // legs of an antiparallel diode clipper, both wired to the same node) must not join that same
    // column - stacked directly under one another they'd read as wired in series, and rewireNets'
    // nearest-neighbour tree would draw exactly that, threading the connecting wire through the
    // first part's body into the second. Side by side (the next column) each leg's own net wire runs
    // straight to it instead of via its neighbour.
    const stackSharesNet = (c: number) => [...placement].some(([other, p]) => p.col === c && Math.sign(p.row) === (down ? 1 : -1) && myNeighbours.has(other));
    // Spill into the next column rather than growing one tower - a block stays roughly as wide as it
    // is tall instead of becoming a column of bypass caps and diodes.
    let c = col;
    while ((stacks.get(c) ?? 0) >= MAX_STACK || stackSharesNet(c)) c++;
    const depth = (stacks.get(c) ?? 0) + 1;
    stacks.set(c, depth);
    // Line up with the pin it hangs off when that pin's part is the signal-row part of this column.
    const rowPart = spine[c];
    const dx = rowPart && myNeighbours.has(rowPart) ? (input.attachX?.(id, rowPart) ?? 0) : 0;
    placement.set(id, { col: c, row: down ? depth : -depth, ...(dx ? { dx } : {}) });
  }
  return placement;
}
