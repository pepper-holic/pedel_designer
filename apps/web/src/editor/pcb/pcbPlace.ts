import type { BoardComponent, BoardNetlist } from "./boardNetlist";
import { courtyard, placedPad, type PcbComponent, type Point, type Rotation } from "./pcbTypes";

/** Placement grid: a quarter of 0.1", so every 2.54mm-pitch pad lands on the router's grid. */
export const GRID = 0.635;
/** Schematic pixels to board millimetres for the starting positions (170px column spacing -> 17mm). */
const SCHEMATIC_TO_MM = 0.1;
const ITERATIONS = 300;
const EDGE_GAP = 3;
export interface PlaceOptions {
  /** Courtyard margin while placing: wide enough that a track fits between neighbouring parts. */
  routingMargin: number;
  /** Schematic pixels to board millimetres for the starting positions. */
  scale: number;
}

export const DEFAULT_PLACE: PlaceOptions = { routingMargin: 1.27, scale: SCHEMATIC_TO_MM };

type Edge = "left" | "right" | "top";

const snap = (v: number) => Math.round(v / GRID) * GRID;

function edgeOf(c: BoardComponent): Edge | null {
  const fp = c.footprint;
  if (!fp.offBoard && !fp.id.startsWith("pot-")) return null;
  const nets = new Set(c.pads.map((p) => p.net));
  if (c.value === "출력 잭 (OUT)") return "right";
  if (nets.has("IN") && fp.offBoard) return "left";
  return "top";
}

interface Body {
  comp: PcbComponent;
  pads: { number: string; net: string }[];
  edge: Edge | null;
}

function padPositions(b: Body): (Point & { net: string })[] {
  const nets = new Map(b.pads.map((p) => [p.number, p.net]));
  return b.comp.footprint.pads.map((pad) => ({ ...placedPad(b.comp, pad, ""), net: nets.get(pad.number) ?? "" }));
}

function overlap(a: PcbComponent, b: PcbComponent, margin: number): { dx: number; dy: number } | null {
  const ca = courtyard(a, margin);
  const cb = courtyard(b, margin);
  const ox = Math.min(ca.maxX, cb.maxX) - Math.max(ca.minX, cb.minX);
  const oy = Math.min(ca.maxY, cb.maxY) - Math.max(ca.minY, cb.minY);
  if (ox <= 0 || oy <= 0) return null;
  // Push apart along the axis that needs the smaller move.
  const centre = (c: ReturnType<typeof courtyard>) => ({ x: (c.minX + c.maxX) / 2, y: (c.minY + c.maxY) / 2 });
  const pa = centre(ca);
  const pb = centre(cb);
  return ox < oy ? { dx: (pa.x <= pb.x ? -1 : 1) * ox, dy: 0 } : { dx: 0, dy: (pa.y <= pb.y ? -1 : 1) * oy };
}

/** Total distance from every pad to the centre of its net - the wirelength the placer shrinks. */
function wirelength(bodies: Body[], only?: Body): number {
  const sums = new Map<string, { x: number; y: number; n: number }>();
  const all = bodies.map((b) => ({ b, pads: padPositions(b) }));
  for (const { pads } of all) {
    for (const p of pads) {
      if (!p.net) continue;
      const s = sums.get(p.net) ?? { x: 0, y: 0, n: 0 };
      s.x += p.x;
      s.y += p.y;
      s.n++;
      sums.set(p.net, s);
    }
  }
  let total = 0;
  for (const { b, pads } of all) {
    if (only && b !== only) continue;
    for (const p of pads) {
      const s = sums.get(p.net);
      if (s && s.n > 1) total += Math.hypot(p.x - s.x / s.n, p.y - s.y / s.n);
    }
  }
  return total;
}

/** Puts the board-edge parts around the current interior: input left, output right, pots and the rest along the top. */
function placeEdges(bodies: Body[], order: Map<string, number>) {
  const interior = bodies.filter((b) => !b.edge);
  const boxes = interior.map((b) => courtyard(b.comp));
  const minX = boxes.length ? Math.min(...boxes.map((c) => c.minX)) : 0;
  const maxX = boxes.length ? Math.max(...boxes.map((c) => c.maxX)) : 20;
  const minY = boxes.length ? Math.min(...boxes.map((c) => c.minY)) : 0;
  const maxY = boxes.length ? Math.max(...boxes.map((c) => c.maxY)) : 20;
  const midY = (minY + maxY) / 2;

  // Along the top, left to right in schematic order: pot bodies hang towards the edge.
  const top = bodies.filter((b) => b.edge === "top").sort((a, b) => (order.get(a.comp.ref) ?? 0) - (order.get(b.comp.ref) ?? 0));
  let x = minX;
  for (const b of top) {
    b.comp.rotation = b.comp.footprint.offBoard ? 90 : 0;
    const box = courtyard({ ...b.comp, x: 0, y: 0 });
    b.comp.x = snap(x - box.minX);
    b.comp.y = snap(minY - EDGE_GAP - box.maxY);
    x += box.maxX - box.minX + 1;
  }
  const topEnd = top.length > 0 ? x : maxX;

  // Jacks down the sides, centred on the circuit but never up into the top row.
  const sideStack = (items: Body[], left: boolean) => {
    const boxes = items.map((b) => courtyard({ ...b.comp, x: 0, y: 0, rotation: 0 }));
    const total = boxes.reduce((sum, box) => sum + box.maxY - box.minY + EDGE_GAP, 0);
    let y = Math.max(minY, midY - total / 2);
    items.forEach((b, i) => {
      const box = boxes[i];
      b.comp.rotation = 0;
      b.comp.x = snap(left ? minX - EDGE_GAP - box.maxX : Math.max(maxX, topEnd) + EDGE_GAP - box.minX);
      b.comp.y = snap(y - box.minY);
      y += box.maxY - box.minY + EDGE_GAP;
    });
  };
  sideStack(
    bodies.filter((b) => b.edge === "left"),
    true,
  );
  sideStack(
    bodies.filter((b) => b.edge === "right"),
    false,
  );
}

function legalize(bodies: Body[], margin: number) {
  const placed: PcbComponent[] = bodies.filter((b) => b.comp.fixed).map((b) => b.comp);
  const movable = bodies.filter((b) => !b.comp.fixed).sort((a, b) => a.comp.x - b.comp.x || a.comp.y - b.comp.y);
  for (const b of movable) {
    const start = { x: snap(b.comp.x), y: snap(b.comp.y) };
    // Spiral outwards on the grid to the nearest spot where the courtyard is clear.
    search: for (let ring = 0; ring < 200; ring++) {
      for (let i = -ring; i <= ring; i++) {
        for (const [dx, dy] of [
          [i, -ring],
          [i, ring],
          [-ring, i],
          [ring, i],
        ]) {
          b.comp.x = start.x + dx * GRID;
          b.comp.y = start.y + dy * GRID;
          if (!placed.some((p) => overlap(p, b.comp, margin))) break search;
        }
      }
    }
    placed.push(b.comp);
  }
}

/**
 * Places the board's parts (plan Stage E-3): start from the schematic - already drawn in signal
 * order, left to right - then let connected parts pull together and overlapping ones push apart,
 * trying each part's four orientations for the shortest connections. Jacks sit on the left and
 * right edges, pots and other panel parts along the top edge, where an enclosure wants them.
 */
export function placeComponents(board: BoardNetlist, partPos: Map<string, Point>, options: PlaceOptions = DEFAULT_PLACE): PcbComponent[] {
  const order = new Map<string, number>();
  const bodies: Body[] = board.components.map((c, i) => {
    const pos = c.partId ? partPos.get(c.partId) : undefined;
    order.set(c.ref, pos?.x ?? i * 100);
    return {
      comp: {
        ref: c.ref,
        value: c.value,
        footprint: c.footprint,
        x: snap((pos?.x ?? i * 100) * options.scale),
        y: snap((pos?.y ?? 0) * options.scale),
        rotation: 0 as Rotation,
        fixed: false,
      },
      pads: c.pads,
      edge: edgeOf(c),
    };
  });
  const interior = bodies.filter((b) => !b.edge);

  // Two-lead parts start upright or flat to suit their neighbours; settle every orientation now
  // and again partway through as the neighbours move.
  const orient = () => {
    for (const b of interior) {
      let best = b.comp.rotation;
      let bestLength = Infinity;
      for (const r of [0, 90, 180, 270] as Rotation[]) {
        b.comp.rotation = r;
        const length = wirelength(bodies, b);
        if (length < bestLength - 1e-6) {
          bestLength = length;
          best = r;
        }
      }
      b.comp.rotation = best;
    }
  };

  placeEdges(bodies, order);
  for (let iter = 0; iter < ITERATIONS; iter++) {
    if (iter % 75 === 0) orient();
    const step = 0.5 * (1 - iter / ITERATIONS) + 0.05;
    // Pull each pad towards the centre of its net.
    const centres = new Map<string, { x: number; y: number; n: number }>();
    const padsOf = new Map(bodies.map((b) => [b, padPositions(b)]));
    for (const pads of padsOf.values()) {
      for (const p of pads) {
        if (!p.net) continue;
        const s = centres.get(p.net) ?? { x: 0, y: 0, n: 0 };
        s.x += p.x;
        s.y += p.y;
        s.n++;
        centres.set(p.net, s);
      }
    }
    for (const b of interior) {
      let fx = 0;
      let fy = 0;
      for (const p of padsOf.get(b)!) {
        const s = centres.get(p.net);
        if (!s || s.n < 2) continue;
        fx += s.x / s.n - p.x;
        fy += s.y / s.n - p.y;
      }
      b.comp.x += Math.max(-3, Math.min(3, fx * step * 0.3));
      b.comp.y += Math.max(-3, Math.min(3, fy * step * 0.3));
    }
    // Push overlapping parts apart.
    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        const a = bodies[i];
        const b = bodies[j];
        if (a.edge && b.edge) continue;
        const o = overlap(a.comp, b.comp, options.routingMargin);
        if (!o) continue;
        const share = a.edge ? 0 : b.edge ? 1 : 0.5;
        if (!a.edge) {
          a.comp.x += o.dx * share * 1.05;
          a.comp.y += o.dy * share * 1.05;
        }
        if (!b.edge) {
          b.comp.x -= o.dx * (1 - share) * 1.05;
          b.comp.y -= o.dy * (1 - share) * 1.05;
        }
      }
    }
    if (iter === Math.floor(ITERATIONS / 2)) placeEdges(bodies, order);
  }
  orient();
  placeEdges(bodies, order);
  for (const b of bodies) if (b.edge) b.comp.fixed = true;
  legalize(bodies, options.routingMargin);

  // Move everything so the board starts at a small margin from (0, 0).
  const boxes = bodies.map((b) => courtyard(b.comp, 0));
  const dx = snap(3 - Math.min(...boxes.map((c) => c.minX)));
  const dy = snap(3 - Math.min(...boxes.map((c) => c.minY)));
  for (const b of bodies) {
    b.comp.x += dx;
    b.comp.y += dy;
  }
  return bodies.map((b) => b.comp);
}
