import type { BoardNetlist } from "./boardNetlist";
import { DEFAULT_PLACE, GRID, placeComponents, type PlaceOptions } from "./pcbPlace";
import { courtyard, placedPad, type CopperLayer, type PcbComponent, type PcbLayout, type PcbRules, type PlacedPad, type Point, type Track, type Via, type WireLink } from "./pcbTypes";

const LAYERS: CopperLayer[] = ["B.Cu", "F.Cu"];
const DIAGONAL = Math.SQRT2;
const BEND_COST = 0.4;
/** Top-layer steps cost more: the bottom is where a home-etched or single-sided board has copper. */
const TOP_LAYER_FACTOR = 1.3;
const VIA_COST = 12;
/** Negotiation rounds, and how fast sharing gets more expensive from round to round. */
const ROUNDS = 14;
const PRESENT_START = 0.6;
const PRESENT_GROWTH = 1.5;
const HISTORY_STEP = 0.6;
const MAX_EXPANSIONS = 300_000;
/** Board margin around the courtyards. */
const MARGIN = 3;

const DIRS: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

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
      const parent = (i - 1) >> 1;
      if (keys[parent] <= key) break;
      items[i] = items[parent];
      keys[i] = keys[parent];
      i = parent;
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
        const r = l + 1;
        let m = i;
        let mk = lastKey;
        if (l < items.length && keys[l] < mk) {
          m = l;
          mk = keys[l];
        }
        if (r < items.length && keys[r] < mk) m = r;
        if (m === i) break;
        items[i] = items[m];
        keys[i] = keys[m];
        i = m;
      }
      items[i] = lastItem;
      keys[i] = lastKey;
    }
    return top;
  }
}

/** One pad-to-tree connection of a net, and the grid path it currently takes. */
interface Connection {
  net: number;
  pad: PlacedPad;
  /** The nearest pad already in the tree when it was planned - the A* goal and the link fallback. */
  near: PlacedPad;
  /** States (layer, cell, direction) from the pad to the tree, or null when not routed. */
  path: number[] | null;
}

/**
 * The routing grid and its occupancy. Pads and the board edge are hard obstacles. Tracks are soft
 * while negotiating: every net marks the cells its copper keeps other centre lines out of, and a
 * cell several nets mark is shared - allowed, but at a price that grows each round until the nets
 * sort out who goes where (negotiated congestion routing, the PathFinder scheme).
 */
class Router {
  readonly nx: number;
  readonly ny: number;
  readonly cells: number;
  readonly layers: number;
  /** Per layer: 0 free, net + 1 inside that net's pad zone, -1 blocked. */
  readonly hard: Int32Array[];
  /** Per layer and net: how many of the net's keep-out discs cover each cell. */
  readonly cover: Uint16Array[][];
  /** Per layer: how many nets cover each cell. */
  readonly total: Uint16Array[];
  readonly history: Float32Array[];
  present = PRESENT_START;
  private readonly keepTrack: number;
  private readonly viaKeep: number;
  private readonly viaCheck: number;
  private readonly g: Float64Array;
  private readonly from: Int32Array;
  private readonly stamp: Int32Array;
  private search = 0;

  constructor(width: number, height: number, nets: number, pads: PlacedPad[], netId: Map<string, number>, rules: PcbRules) {
    this.nx = Math.ceil(width / GRID) + 1;
    this.ny = Math.ceil(height / GRID) + 1;
    this.cells = this.nx * this.ny;
    this.layers = rules.singleSided ? 1 : 2;
    this.hard = Array.from({ length: this.layers }, () => new Int32Array(this.cells));
    this.cover = Array.from({ length: this.layers }, () => Array.from({ length: nets }, () => new Uint16Array(this.cells)));
    this.total = Array.from({ length: this.layers }, () => new Uint16Array(this.cells));
    this.history = Array.from({ length: this.layers }, () => new Float32Array(this.cells));
    this.keepTrack = rules.trackWidth + rules.clearance;
    this.viaKeep = rules.viaSize / 2 + rules.clearance + rules.trackWidth / 2;
    // Marks reach `keepTrack` past a centre line, so a via is clear when no foreign mark lies within
    // the remainder - plus a grid step because marks sit on cell centres.
    this.viaCheck = this.viaKeep - this.keepTrack + GRID;
    const states = this.layers * this.cells * 9;
    this.g = new Float64Array(states);
    this.from = new Int32Array(states);
    this.stamp = new Int32Array(states);

    const edge = rules.edgeClearance + rules.trackWidth / 2;
    for (let l = 0; l < this.layers; l++) {
      for (let j = 0; j < this.ny; j++) {
        for (let i = 0; i < this.nx; i++) {
          const x = i * GRID;
          const y = j * GRID;
          if (x < edge || y < edge || x > width - edge || y > height - edge) this.hard[l][j * this.nx + i] = -1;
        }
      }
    }
    // Through-hole pads: copper on both layers.
    for (const p of pads) {
      const id = p.net ? netId.get(p.net)! : -2;
      const radius = (p.square ? (p.size / 2) * Math.SQRT2 : p.size / 2) + rules.clearance + rules.trackWidth / 2;
      for (let l = 0; l < this.layers; l++) this.disc(p.x, p.y, radius, (c) => (this.hard[l][c] = this.hard[l][c] === 0 ? id + 1 : this.hard[l][c] === id + 1 ? id + 1 : -1));
    }
  }

  cellOf(x: number, y: number) {
    return Math.round(y / GRID) * this.nx + Math.round(x / GRID);
  }

  point(cell: number): Point {
    return { x: (cell % this.nx) * GRID, y: Math.floor(cell / this.nx) * GRID };
  }

  private disc(x: number, y: number, radius: number, visit: (cell: number) => void) {
    const r = Math.ceil(radius / GRID);
    const ci = Math.round(x / GRID);
    const cj = Math.round(y / GRID);
    for (let j = cj - r; j <= cj + r; j++) {
      if (j < 0 || j >= this.ny) continue;
      for (let i = ci - r; i <= ci + r; i++) {
        if (i < 0 || i >= this.nx) continue;
        if (Math.hypot(i * GRID - x, j * GRID - y) > radius + 1e-9) continue;
        visit(j * this.nx + i);
      }
    }
  }

  private mark(layer: number, cell: number, radius: number, net: number, delta: 1 | -1) {
    const p = this.point(cell);
    const own = this.cover[layer][net];
    const total = this.total[layer];
    this.disc(p.x, p.y, radius, (c) => {
      if (delta > 0) {
        if (own[c]++ === 0) total[c]++;
      } else if (--own[c] === 0) total[c]--;
    });
  }

  /** Decodes a path into (layer, cell) steps and the cells where it changes layer. */
  steps(path: number[]): { layer: number; cell: number; via: boolean }[] {
    const out: { layer: number; cell: number; via: boolean }[] = [];
    for (const s of path) {
      const lc = (s - (s % 9)) / 9;
      const layer = Math.floor(lc / this.cells);
      const cell = lc - layer * this.cells;
      const prev = out[out.length - 1];
      out.push({ layer, cell, via: !!prev && prev.layer !== layer });
    }
    return out;
  }

  /** Adds (or with -1 removes) a routed path's keep-outs. */
  apply(path: number[], net: number, delta: 1 | -1) {
    for (const step of this.steps(path)) {
      this.mark(step.layer, step.cell, this.keepTrack, net, delta);
      if (step.via) for (let l = 0; l < this.layers; l++) this.mark(l, step.cell, this.viaKeep, net, delta);
    }
  }

  /** Nets other than `net` whose copper keeps out of this cell. */
  others(layer: number, cell: number, net: number) {
    return this.total[layer][cell] - (this.cover[layer][net][cell] > 0 ? 1 : 0);
  }

  private viaAllowed(cell: number, net: number, strict: boolean): boolean {
    const p = this.point(cell);
    let ok = true;
    for (let l = 0; l < this.layers && ok; l++) {
      this.disc(p.x, p.y, this.viaCheck, (c) => {
        const h = this.hard[l][c];
        if ((h !== 0 && h !== net + 1) || (strict && this.others(l, c, net) > 0)) ok = false;
      });
    }
    return ok;
  }

  /**
   * A* from `source` to any of `targets` (layer * cells + cell). Negotiating, other nets' copper is
   * a cost; strict, it is a wall. Null when even that cannot get through.
   */
  route(net: number, source: number, targets: Set<number>, goal: Point, strict: boolean): number[] | null {
    const { nx, ny, cells, layers, g, from, stamp } = this;
    const search = ++this.search;
    const heap = new Heap();
    const h = (c: number) => {
      const i = c % nx;
      const j = (c - i) / nx;
      const dx = Math.abs(i * GRID - goal.x) / GRID;
      const dy = Math.abs(j * GRID - goal.y) / GRID;
      return Math.max(dx, dy) + (DIAGONAL - 1) * Math.min(dx, dy);
    };
    const passable = (l: number, c: number) => {
      const v = this.hard[l][c];
      if (v !== 0 && v !== net + 1) return false;
      return !strict || this.others(l, c, net) === 0;
    };
    const price = (l: number, c: number) => (strict ? 1 : (1 + this.history[l][c]) * (1 + this.present * this.others(l, c, net)));
    for (let l = 0; l < layers; l++) {
      const s = (l * cells + source) * 9 + 8;
      g[s] = 0;
      from[s] = -1;
      stamp[s] = search;
      heap.push(s, h(source));
    }
    let expansions = 0;
    while (heap.size > 0) {
      const s = heap.pop();
      const dir = s % 9;
      const lc = (s - dir) / 9;
      const layer = Math.floor(lc / cells);
      const c = lc - layer * cells;
      if (c !== source && targets.has(lc)) {
        const path: number[] = [];
        for (let t = s; t !== -1; t = from[t]) path.push(t);
        return path.reverse();
      }
      if (++expansions > MAX_EXPANSIONS) return null;
      const gs = g[s];
      const i = c % nx;
      const j = (c - i) / nx;
      const factor = layer === 1 ? TOP_LAYER_FACTOR : 1;
      for (let d = 0; d < 8; d++) {
        const ni = i + DIRS[d][0];
        const nj = j + DIRS[d][1];
        if (ni < 0 || nj < 0 || ni >= nx || nj >= ny) continue;
        const nc = nj * nx + ni;
        if (!passable(layer, nc)) continue;
        // A diagonal step may not squeeze between two blocked orthogonal neighbours.
        if (d >= 4 && (!passable(layer, j * nx + ni) || !passable(layer, nj * nx + i))) continue;
        const step = (d >= 4 ? DIAGONAL : 1) * factor * price(layer, nc) + (dir !== 8 && dir !== d ? BEND_COST : 0);
        const ns = (layer * cells + nc) * 9 + d;
        const ng = gs + step;
        if (stamp[ns] === search && g[ns] <= ng) continue;
        stamp[ns] = search;
        g[ns] = ng;
        from[ns] = s;
        heap.push(ns, ng + h(nc));
      }
      if (layers === 2) {
        const other = 1 - layer;
        const ns = (other * cells + c) * 9 + 8;
        const ng = gs + VIA_COST * (strict ? 1 : 1 + this.present * this.others(other, c, net));
        if ((stamp[ns] !== search || g[ns] > ng) && passable(other, c) && this.viaAllowed(c, net, strict)) {
          stamp[ns] = search;
          g[ns] = ng;
          from[ns] = s;
          heap.push(ns, ng + h(c));
        }
      }
    }
    return null;
  }
}

/** Plans each net as a tree: Prim's order over the pads, each joining the nearest one already in. */
function planConnections(pads: PlacedPad[], nets: string[]): Connection[][] {
  return nets.map((name, net) => {
    const netPads = pads.filter((p) => p.net === name);
    const tree = [netPads[0]];
    const rest = netPads.slice(1);
    const conns: Connection[] = [];
    while (rest.length > 0) {
      let bi = 0;
      let bd = Infinity;
      let near = tree[0];
      rest.forEach((p, i) => {
        for (const q of tree) {
          const d = Math.hypot(p.x - q.x, p.y - q.y);
          if (d < bd) {
            bd = d;
            bi = i;
            near = q;
          }
        }
      });
      const pad = rest.splice(bi, 1)[0];
      conns.push({ net, pad, near, path: null });
      tree.push(pad);
    }
    return conns;
  });
}

interface RouteResult {
  tracks: Track[];
  vias: Via[];
  links: WireLink[];
  unrouted: { net: string; a: Point; b: Point }[];
}

function routeNets(pads: PlacedPad[], nets: string[], width: number, height: number, rules: PcbRules): RouteResult {
  const netId = new Map(nets.map((n, i) => [n, i]));
  const router = new Router(width, height, nets.length, pads, netId, rules);
  const plans = planConnections(pads, nets);
  const allLayers = (cell: number) => Array.from({ length: router.layers }, (_, l) => l * router.cells + cell);

  /** Routes one net's connections in order against the current state of the others. */
  const routeNet = (net: number, strict: boolean, only?: Set<Connection>) => {
    const conns = plans[net];
    const targets = new Set<number>();
    const first = pads.find((p) => p.net === nets[net])!;
    for (const lc of allLayers(router.cellOf(first.x, first.y))) targets.add(lc);
    for (const conn of conns) {
      const source = router.cellOf(conn.pad.x, conn.pad.y);
      if (!only || only.has(conn)) {
        const onTree = allLayers(source).some((lc) => targets.has(lc));
        conn.path = onTree ? [] : router.route(net, source, targets, conn.near, strict);
        if (conn.path) router.apply(conn.path, net, 1);
      }
      for (const lc of allLayers(source)) targets.add(lc);
      if (conn.path) for (const s of conn.path) targets.add((s - (s % 9)) / 9);
    }
  };
  const conflictsOf = (conn: Connection) => {
    if (!conn.path) return 0;
    let n = 0;
    for (const step of router.steps(conn.path)) if (router.others(step.layer, step.cell, conn.net) > 0) n++;
    return n;
  };

  for (let round = 0; round < ROUNDS; round++) {
    for (let net = 0; net < nets.length; net++) {
      for (const conn of plans[net]) if (conn.path) router.apply(conn.path, net, -1);
      routeNet(net, false);
    }
    let conflicts = 0;
    for (const conns of plans) {
      for (const conn of conns) {
        if (!conn.path) continue;
        for (const step of router.steps(conn.path)) {
          if (router.others(step.layer, step.cell, conn.net) > 0) {
            conflicts++;
            router.history[step.layer][step.cell] += HISTORY_STEP;
          }
        }
      }
    }
    if (conflicts === 0) break;
    router.present *= PRESENT_GROWTH;
  }

  // Whatever still shares copper is taken out, worst first, and retried as a strict route.
  const removed = new Set<Connection>();
  for (;;) {
    let worst: Connection | null = null;
    let worstCount = 0;
    for (const conns of plans) {
      for (const conn of conns) {
        const n = conflictsOf(conn);
        if (n > worstCount) {
          worstCount = n;
          worst = conn;
        }
      }
    }
    if (!worst) break;
    router.apply(worst.path!, worst.net, -1);
    worst.path = null;
    removed.add(worst);
  }
  for (let net = 0; net < nets.length; net++) {
    const retry = new Set(plans[net].filter((c) => removed.has(c) || c.path === null));
    if (retry.size > 0) routeNet(net, true, retry);
  }

  // A connection whose path is gone may have carried others; reconnect each net's pieces.
  const links: WireLink[] = [];
  const unrouted: RouteResult["unrouted"] = [];
  for (let net = 0; net < nets.length; net++) {
    const groups = padGroups(router, plans[net], pads.filter((p) => p.net === nets[net]));
    if (groups.length <= 1) continue;
    const [tree, ...others] = groups;
    for (const group of others) {
      // Strict route from the group's nearest pad to the main tree's copper; failing that, a link.
      let best: [PlacedPad, PlacedPad] = [group.pads[0], tree.pads[0]];
      for (const a of group.pads) for (const b of tree.pads) if (Math.hypot(a.x - b.x, a.y - b.y) < Math.hypot(best[0].x - best[1].x, best[0].y - best[1].y)) best = [a, b];
      const conn: Connection = { net, pad: best[0], near: best[1], path: null };
      conn.path = router.route(net, router.cellOf(best[0].x, best[0].y), tree.cells, best[1], true);
      if (conn.path) {
        router.apply(conn.path, net, 1);
        plans[net].push(conn);
        for (const s of conn.path) tree.cells.add((s - (s % 9)) / 9);
      } else if (rules.singleSided) links.push({ net: nets[net], a: { x: best[0].x, y: best[0].y }, b: { x: best[1].x, y: best[1].y } });
      else unrouted.push({ net: nets[net], a: { x: best[0].x, y: best[0].y }, b: { x: best[1].x, y: best[1].y } });
      tree.pads.push(...group.pads);
      for (const lc of group.cells) tree.cells.add(lc);
    }
  }

  const tracks: Track[] = [];
  const vias: Via[] = [];
  for (const conns of plans) {
    for (const conn of conns) {
      if (!conn.path || conn.path.length === 0) continue;
      const netName = nets[conn.net];
      const steps = router.steps(conn.path);
      const pieces: Track[] = [];
      let current: Point[] = [];
      let layer = steps[0].layer;
      for (const step of steps) {
        const pt = router.point(step.cell);
        if (step.via) {
          if (current.length > 1) pieces.push({ net: netName, layer: LAYERS[layer], width: rules.trackWidth, points: simplify(current) });
          vias.push({ net: netName, x: pt.x, y: pt.y, size: rules.viaSize, drill: rules.viaDrill });
          current = [];
        }
        layer = step.layer;
        current.push(pt);
      }
      if (current.length > 1) pieces.push({ net: netName, layer: LAYERS[layer], width: rules.trackWidth, points: simplify(current) });
      // A pad off the routing grid (5mm-pitch parts) gets the track end moved onto its centre.
      if (pieces.length > 0) {
        const netPads = pads.filter((p) => p.net === netName);
        const head = pieces[0].points;
        const tail = pieces[pieces.length - 1].points;
        head[0] = onPad(head[0], netPads);
        tail[tail.length - 1] = onPad(tail[tail.length - 1], netPads);
      }
      tracks.push(...pieces);
    }
  }
  return { tracks, vias, links, unrouted };
}

/** The net's pads grouped by what its routed paths actually join, with each group's copper cells. */
function padGroups(router: Router, conns: Connection[], netPads: PlacedPad[]): { pads: PlacedPad[]; cells: Set<number> }[] {
  const parent = new Map<number, number>();
  const find = (x: number): number => {
    let r = x;
    while (parent.has(r) && parent.get(r) !== r) r = parent.get(r)!;
    parent.set(x, r);
    return r;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  // Keyed by (layer, cell): consecutive path steps are joined (a layer change happens at a via);
  // a through-hole pad joins both layers at its cell.
  for (const conn of conns) {
    if (!conn.path || conn.path.length === 0) continue;
    const steps = router.steps(conn.path);
    for (let i = 1; i < steps.length; i++) union(steps[i - 1].layer * router.cells + steps[i - 1].cell, steps[i].layer * router.cells + steps[i].cell);
  }
  const groups = new Map<number, { pads: PlacedPad[]; cells: Set<number> }>();
  for (const p of netPads) {
    const cell = router.cellOf(p.x, p.y);
    for (let l = 1; l < router.layers; l++) union(cell, l * router.cells + cell);
  }
  for (const p of netPads) {
    const root = find(router.cellOf(p.x, p.y));
    if (!groups.has(root)) groups.set(root, { pads: [], cells: new Set() });
    groups.get(root)!.pads.push(p);
  }
  for (const key of [...parent.keys()]) groups.get(find(key))?.cells.add(key);
  for (const p of netPads) {
    const cell = router.cellOf(p.x, p.y);
    for (let l = 0; l < router.layers; l++) groups.get(find(cell))!.cells.add(l * router.cells + cell);
  }
  return [...groups.values()];
}

/** Drops the points in the middle of straight runs. */
function simplify(points: Point[]): Point[] {
  const out: Point[] = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const a = out[out.length - 1];
    const b = points[i];
    const c = points[i + 1];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) > 1e-9) out.push(b);
  }
  out.push(points[points.length - 1]);
  return out;
}

/** The centre of the pad a grid point sits on, if it sits on one off its centre. */
function onPad(pt: Point, pads: PlacedPad[]): Point {
  for (const p of pads) if (Math.hypot(p.x - pt.x, p.y - pt.y) < Math.min(p.size / 2, GRID)) return { x: p.x, y: p.y };
  return pt;
}

/** Board size from the placed parts. */
export function boardSize(components: PcbComponent[]): { width: number; height: number } {
  const boxes = components.map((c) => courtyard(c, 0));
  const width = Math.ceil((Math.max(...boxes.map((b) => b.maxX)) + MARGIN) / GRID) * GRID;
  const height = Math.ceil((Math.max(...boxes.map((b) => b.maxY)) + MARGIN) / GRID) * GRID;
  return { width, height };
}

export function boardPads(components: PcbComponent[], board: BoardNetlist): PlacedPad[] {
  const netsByRef = new Map(board.components.map((c) => [c.ref, new Map(c.pads.map((p) => [p.number, p.net]))]));
  return components.flatMap((c) => c.footprint.pads.map((pad) => placedPad(c, pad, netsByRef.get(c.ref)?.get(pad.number) ?? "")));
}

/**
 * Routes the board on a 0.635mm grid (plan Stage E-3). Every net is routed as a tree; nets may
 * share copper at first, at a price that rises each round until they no longer do. Anything still
 * fighting at the end is retried as a strict route, and on a single-sided board what is left
 * becomes wire links - the DIY way. Double-sided boards report it as unrouted instead.
 */
export function routeBoard(components: PcbComponent[], board: BoardNetlist, rules: PcbRules): PcbLayout {
  const { width, height } = boardSize(components);
  const pads = boardPads(components, board);
  // Small nets first: in each round the later nets see the earlier ones' copper.
  const spread = (net: string) => {
    const ps = pads.filter((p) => p.net === net);
    return Math.max(...ps.map((p) => p.x)) - Math.min(...ps.map((p) => p.x)) + Math.max(...ps.map((p) => p.y)) - Math.min(...ps.map((p) => p.y));
  };
  const nets = board.nets.filter((n) => pads.filter((p) => p.net === n).length > 1).sort((a, b) => spread(a) - spread(b));
  const result = routeNets(pads, nets, width, height, rules);
  return { width, height, components, ...result, rules };
}

/** Placement variants tried: tighter and looser spacing, closer and wider starting spread. */
const PLACEMENTS: PlaceOptions[] = [DEFAULT_PLACE, { ...DEFAULT_PLACE, routingMargin: 1.9 }, { ...DEFAULT_PLACE, scale: 0.13 }];

/**
 * Places and routes a board: a few placement variants, each routed, and the one with the fewest
 * unrouted connections (wire links on a single-sided board), then the smallest area, wins.
 */
export function generatePcb(board: BoardNetlist, partPos: Map<string, Point>, rules: PcbRules): PcbLayout {
  let best: PcbLayout | null = null;
  const score = (l: PcbLayout) => (l.links.length + l.unrouted.length) * 10_000 + l.width * l.height;
  for (const options of PLACEMENTS) {
    const layout = routeBoard(placeComponents(board, partPos, options), board, rules);
    if (!best || score(layout) < score(best)) best = layout;
    if (layout.links.length + layout.unrouted.length === 0) break;
  }
  return best!;
}
