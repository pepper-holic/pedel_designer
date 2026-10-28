import type { Point } from "../geometry";

export interface Rect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface RouteRequest {
  a: Point;
  b: Point;
  /** Wires of the same net may share track; different nets pay to overlap. */
  net: string;
  /** Preferred axis (0=horizontal,1=vertical) to leave `a` / arrive at `b` along - a terminal's own
   * lead axis (geometry.ts's terminalLeadAxis). Only the axis is fixed, not the direction along it:
   * discouraged, not forbidden, a wire can still bend right at the pin if that's the only way through. */
  axisA?: 0 | 1;
  axisB?: 0 | 1;
}

export interface RouterOptions {
  grid?: number;
  /** Extra cost per 90-degree turn, in grid steps. */
  bendCost?: number;
  /** Cost of running along a cell another net already runs along in the same direction. */
  overlapCost?: number;
  /** Cost of crossing another net's track at right angles. */
  crossCost?: number;
  /** Discount off the normal per-cell cost for riding along a cell the SAME net already occupies -
   * what pulls a net's later (and often longer) wires onto an earlier wire's track instead of each
   * cutting its own parallel path a few grid steps away (L3: "same node drawn as two lines"). */
  alongBonus?: number;
  /** Give up on a wire after this many expansions and fall back to the plain route. */
  maxExpansions?: number;
}

const DIRS = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
] as const;

/** Binary min-heap of state indices keyed by f-score. */
class Heap {
  private items: number[] = [];
  private keys: number[] = [];
  get size() {
    return this.items.length;
  }
  push(item: number, key: number) {
    const items = this.items;
    const keys = this.keys;
    let i = items.length;
    items.push(item);
    keys.push(key);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p] <= key) break;
      items[i] = items[p];
      keys[i] = keys[p];
      i = p;
    }
    items[i] = item;
    keys[i] = key;
  }
  pop(): number {
    const items = this.items;
    const keys = this.keys;
    const top = items[0];
    const lastItem = items.pop()!;
    const lastKey = keys.pop()!;
    if (items.length > 0) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= items.length) break;
        const r = l + 1;
        const c = r < items.length && keys[r] < keys[l] ? r : l;
        if (keys[c] >= lastKey) break;
        items[i] = items[c];
        keys[i] = keys[c];
        i = c;
      }
      items[i] = lastItem;
      keys[i] = lastKey;
    }
    return top;
  }
}

/** Collapses a cell-by-cell path to its corner points. */
function corners(path: Point[]): Point[] {
  if (path.length <= 2) return path;
  const out = [path[0]];
  for (let i = 1; i < path.length - 1; i++) {
    const prev = out[out.length - 1];
    const next = path[i + 1];
    const cur = path[i];
    const straight = (prev.x === cur.x && cur.x === next.x) || (prev.y === cur.y && cur.y === next.y);
    if (!straight) out.push(cur);
  }
  out.push(path[path.length - 1]);
  return out;
}

/**
 * Obstacle-avoiding orthogonal router (grid A* with a turn penalty). Part bodies and collapsed block
 * boxes are walls; already-routed wires of other nets are soft costs, so later wires prefer their
 * own lane instead of running on top of an earlier one. Wires are routed shortest first, since short
 * local connections have the fewest alternatives.
 *
 * Returns one corner-point polyline per request, in request order. A wire that cannot be routed
 * within the expansion budget comes back as null so the caller can fall back to its plain route.
 */
export function routeWires(requests: RouteRequest[], obstacles: Rect[], options: RouterOptions = {}): (Point[] | null)[] {
  const g = options.grid ?? 10;
  // Tuned on the 23 presets: crossings 53 -> 20 against the 4/8/1.5 starting point, for ~2% more
  // wire. A crossing costs two bends - people read a jog more easily than a wire hopping another.
  const bendCost = options.bendCost ?? 6;
  const overlapCost = options.overlapCost ?? 12;
  const crossCost = options.crossCost ?? 12;
  const alongBonus = options.alongBonus ?? 0.7;
  const maxExpansions = options.maxExpansions ?? 60_000;
  if (requests.length === 0) return [];

  const xs = [...requests.flatMap((r) => [r.a.x, r.b.x]), ...obstacles.flatMap((o) => [o.x1, o.x2])];
  const ys = [...requests.flatMap((r) => [r.a.y, r.b.y]), ...obstacles.flatMap((o) => [o.y1, o.y2])];
  const margin = 6 * g;
  const minX = Math.floor((Math.min(...xs) - margin) / g) * g;
  const minY = Math.floor((Math.min(...ys) - margin) / g) * g;
  const cols = Math.ceil((Math.max(...xs) + margin - minX) / g) + 1;
  const rows = Math.ceil((Math.max(...ys) + margin - minY) / g) + 1;
  const cells = cols * rows;
  const cellOf = (p: Point) => Math.round((p.y - minY) / g) * cols + Math.round((p.x - minX) / g);
  const pointOf = (c: number): Point => ({ x: minX + (c % cols) * g, y: minY + Math.floor(c / cols) * g });

  const blocked = new Uint8Array(cells);
  for (const o of obstacles) {
    const cx1 = Math.ceil((o.x1 - minX) / g);
    const cx2 = Math.floor((o.x2 - minX) / g);
    const cy1 = Math.ceil((o.y1 - minY) / g);
    const cy2 = Math.floor((o.y2 - minY) / g);
    for (let y = Math.max(0, cy1); y <= Math.min(rows - 1, cy2); y++) for (let x = Math.max(0, cx1); x <= Math.min(cols - 1, cx2); x++) blocked[y * cols + x] = 1;
  }

  const nets = new Map<string, number>();
  const netId = (n: string) => {
    if (!nets.has(n)) nets.set(n, nets.size + 1);
    return nets.get(n)!;
  };
  const hOcc = new Int32Array(cells);
  const vOcc = new Int32Array(cells);

  const states = cells * 4;
  const gScore = new Float64Array(states);
  const cameFrom = new Int32Array(states);
  const stamp = new Int32Array(states);
  let epoch = 0;

  const order = requests.map((r, i) => ({ i, d: Math.abs(r.a.x - r.b.x) + Math.abs(r.a.y - r.b.y) })).sort((p, q) => p.d - q.d);
  const results: (Point[] | null)[] = new Array(requests.length).fill(null);

  for (const { i } of order) {
    const req = requests[i];
    const net = netId(req.net);
    const start = cellOf(req.a);
    const goal = cellOf(req.b);
    if (start === goal) {
      results[i] = [req.a, req.b];
      continue;
    }
    epoch++;
    const gx = goal % cols;
    const gy = Math.floor(goal / cols);
    const h = (c: number) => Math.abs((c % cols) - gx) + Math.abs(Math.floor(c / cols) - gy);
    const heap = new Heap();
    // Leaving along a terminal's own lead axis (either direction on it) gets a free start; leaving
    // across it costs a bend, the same as turning mid-path - so the wire takes a short straight stub
    // off the pin before it bends, like a hand-drawn schematic, instead of bending right at the terminal.
    for (let d = 0; d < 4; d++) {
      const s = start * 4 + d;
      stamp[s] = epoch;
      gScore[s] = req.axisA !== undefined && ((d % 2) as 0 | 1) !== req.axisA ? bendCost : 0;
      cameFrom[s] = -1;
      heap.push(s, gScore[s] + h(start));
    }
    let found = -1;
    let expansions = 0;
    while (heap.size > 0 && expansions < maxExpansions) {
      const s = heap.pop();
      const c = s >> 2;
      const d = s & 3;
      if (c === goal) {
        found = s;
        break;
      }
      expansions++;
      const cx = c % cols;
      const cy = (c - cx) / cols;
      const base = gScore[s];
      for (let nd = 0; nd < 4; nd++) {
        if (nd === ((d + 2) & 3) && cameFrom[s] !== -1) continue; // no U-turn in place
        const nx = cx + DIRS[nd][0];
        const ny = cy + DIRS[nd][1];
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const nc = ny * cols + nx;
        if (blocked[nc] && nc !== goal) continue;
        const horizontal = nd === 0 || nd === 2;
        let cost = 1;
        if (cameFrom[s] !== -1 && nd !== d) cost += bendCost;
        const along = horizontal ? hOcc[nc] : vOcc[nc];
        const across = horizontal ? vOcc[nc] : hOcc[nc];
        if (along) cost += along === net ? -alongBonus : overlapCost;
        if (across && across !== net) cost += crossCost;
        // Symmetric with the start bias: arriving at the goal along its own lead axis is free, crossing
        // it costs a bend - so the far end gets a straight stub too.
        if (nc === goal && req.axisB !== undefined && ((nd % 2) as 0 | 1) !== req.axisB) cost += bendCost;
        const ns = nc * 4 + nd;
        const tentative = base + cost;
        if (stamp[ns] === epoch && gScore[ns] <= tentative) continue;
        stamp[ns] = epoch;
        gScore[ns] = tentative;
        cameFrom[ns] = s;
        heap.push(ns, tentative + h(nc));
      }
    }
    if (found < 0) continue;

    const cellsPath: number[] = [];
    for (let s = found; s !== -1; s = cameFrom[s]) cellsPath.push(s >> 2);
    cellsPath.reverse();
    for (let k = 1; k < cellsPath.length; k++) {
      const a = cellsPath[k - 1];
      const b = cellsPath[k];
      const horizontal = Math.abs(a - b) === 1;
      (horizontal ? hOcc : vOcc)[a] = net;
      (horizontal ? hOcc : vOcc)[b] = net;
    }
    const pts = cellsPath.map(pointOf);
    // Pin the ends to the exact terminal coordinates (the grid is aligned to them in practice).
    pts[0] = req.a;
    pts[pts.length - 1] = req.b;
    results[i] = corners(pts);
  }
  return results;
}
