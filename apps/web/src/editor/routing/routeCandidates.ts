import { GRID_SIZE, type LeadOutward, type Point } from "../geometry";

export interface RouteEnd {
  at: Point;
  lead?: LeadOutward;
  /** The part or collapsed block this end belongs to - exempt from its own body check on the first leg. */
  ownerId?: string;
}

/** How far a wire runs straight out of a pin before its first bend in the detour shapes. */
const STUB = 2 * GRID_SIZE;
/** How far outside the two ends' span a detour may swing, in grid steps. */
const OUTSIDE_STEPS = [1, 2, 3, 4];
/** Most interior positions sampled for a Z's middle leg - coarser on a long span, never finer than the grid. */
const MAX_INTERIOR_SAMPLES = 24;

/** Grid points strictly between lo and hi, nearest the midpoint first so ties go to the centred Z. */
function interior(lo: number, hi: number): number[] {
  const span = hi - lo;
  if (span <= GRID_SIZE) return [];
  const step = Math.max(GRID_SIZE, Math.ceil(span / MAX_INTERIOR_SAMPLES / GRID_SIZE) * GRID_SIZE);
  const mid = (lo + hi) / 2;
  const out: number[] = [];
  for (let v = Math.ceil((lo + 1) / step) * step; v < hi; v += step) out.push(v);
  return out.sort((p, q) => Math.abs(p - mid) - Math.abs(q - mid));
}

function outside(lo: number, hi: number): number[] {
  return OUTSIDE_STEPS.flatMap((k) => [lo - k * 2 * GRID_SIZE, hi + k * 2 * GRID_SIZE]);
}

function dedupe(points: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (last && last.x === p.x && last.y === p.y) continue;
    const prev = out[out.length - 2];
    if (prev && last && ((prev.x === last.x && last.x === p.x) || (prev.y === last.y && last.y === p.y))) out.pop();
    out.push(p);
  }
  return out;
}

/** The directions a detour's first stub may take out of `end`: the lead's own way when known,
 * otherwise both ways along the axis that would make the shape orthogonal. */
function stubOffsets(end: RouteEnd, axis: 0 | 1): number[] {
  if (end.lead && end.lead.axis === axis) return [end.lead.sign * STUB];
  if (end.lead) return [];
  return [STUB, -STUB];
}

/**
 * The shapes worth trying between two ends, cheapest family first:
 *  - `cheap`: a straight run, both L's, and Z's with the middle leg anywhere between or just outside
 *    the two ends;
 *  - `detours()`: 4-bend runs that leave each pin with a short straight stub and swing around via a
 *    rail outside (or between) the ends - the only shapes that can get out of a pin facing away from
 *    its destination, or around a body sitting right between two aligned pins. Built lazily since
 *    most wires never need them.
 */
export function candidateRoutes(a: RouteEnd, b: RouteEnd): { cheap: Point[][]; detours: () => Point[][] } {
  const p = a.at;
  const q = b.at;
  const cheap: Point[][] = [];
  const aligned = p.x === q.x || p.y === q.y;
  if (aligned) cheap.push([p, q]);
  else {
    cheap.push([p, { x: q.x, y: p.y }, q], [p, { x: p.x, y: q.y }, q]);
    const xs = [...interior(Math.min(p.x, q.x), Math.max(p.x, q.x)), ...outside(Math.min(p.x, q.x), Math.max(p.x, q.x))];
    const ys = [...interior(Math.min(p.y, q.y), Math.max(p.y, q.y)), ...outside(Math.min(p.y, q.y), Math.max(p.y, q.y))];
    for (const m of xs) cheap.push([p, { x: m, y: p.y }, { x: m, y: q.y }, q]);
    for (const m of ys) cheap.push([p, { x: p.x, y: m }, { x: q.x, y: m }, q]);
  }
  if (p.y === q.y) {
    // Two pins level with each other but not reachable straight: swing above or below.
    for (const m of outside(p.y, p.y)) cheap.push([p, { x: p.x, y: m }, { x: q.x, y: m }, q]);
  }
  if (p.x === q.x) {
    for (const m of outside(p.x, p.x)) cheap.push([p, { x: m, y: p.y }, { x: m, y: q.y }, q]);
  }

  const detours = () => {
    const out: Point[][] = [];
    const ysAll = [...interior(Math.min(p.y, q.y), Math.max(p.y, q.y)), ...outside(Math.min(p.y, q.y), Math.max(p.y, q.y))];
    const xsAll = [...interior(Math.min(p.x, q.x), Math.max(p.x, q.x)), ...outside(Math.min(p.x, q.x), Math.max(p.x, q.x))];
    // Horizontal stubs, vertical risers, one horizontal rail at y = m.
    for (const sa of stubOffsets(a, 0))
      for (const sb of stubOffsets(b, 0))
        for (const m of ysAll) out.push(dedupe([p, { x: p.x + sa, y: p.y }, { x: p.x + sa, y: m }, { x: q.x + sb, y: m }, { x: q.x + sb, y: q.y }, q]));
    // Vertical stubs, horizontal runs, one vertical rail at x = m.
    for (const sa of stubOffsets(a, 1))
      for (const sb of stubOffsets(b, 1))
        for (const m of xsAll) out.push(dedupe([p, { x: p.x, y: p.y + sa }, { x: m, y: p.y + sa }, { x: m, y: q.y + sb }, { x: q.x, y: q.y + sb }, q]));
    return out.filter((pts) => pts.length >= 2);
  };

  return { cheap, detours };
}
