import type { LeadOutward, Point } from "../geometry";
import { candidateRoutes, type RouteEnd } from "./routeCandidates";

export type { RouteEnd } from "./routeCandidates";

export interface Rect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface RouteJob {
  id: string;
  net: string;
  a: RouteEnd;
  b: RouteEnd;
  /** A path the user fixed by hand: taken as-is, but still an obstacle for every other wire. */
  fixed?: Point[];
}

export interface RouteObstacle {
  rect: Rect;
  /** The part (or collapsed block) this body belongs to - its own wires may start/end inside it. */
  ownerId: string;
}

export interface RoutePin {
  at: Point;
  net: string | undefined;
}

export interface RouteContext {
  obstacles: RouteObstacle[];
  /** Every visible terminal: a wire of another net must not run through one (it would read as a join). */
  pins: RoutePin[];
}

/** Keep-out kept around every foreign body, so a wire never hugs a symbol it has nothing to do with. */
const CLEARANCE = 4;
/** A leg through another part's body, or back through the wire's own part. */
const BODY_HIT = 1000;
/** A leg running exactly along a wire of another net - reads as a short. */
const FOREIGN_OVERLAP = 2000;
/** A leg running through another net's pin. */
const FOREIGN_PIN = 600;
const CROSSING = 60;
const BEND = 30;
/** The wire turns right at a pin instead of leaving along its lead first. */
const STUB_TURN = 80;
/** Anything scoring this or worse has a real defect worth spending the 4-bend family on. */
const ESCALATE_AT = STUB_TURN;

interface Segment {
  a: Point;
  b: Point;
  net: string;
}

function segmentsOf(points: Point[], net: string): Segment[] {
  const segs: Segment[] = [];
  for (let i = 0; i < points.length - 1; i++) segs.push({ a: points[i], b: points[i + 1], net });
  return segs;
}

function hitsRect(a: Point, b: Point, r: Rect): boolean {
  if (a.y === b.y) return a.y > r.y1 && a.y < r.y2 && Math.max(a.x, b.x) > r.x1 && Math.min(a.x, b.x) < r.x2;
  return a.x > r.x1 && a.x < r.x2 && Math.max(a.y, b.y) > r.y1 && Math.min(a.y, b.y) < r.y2;
}

/** `p` strictly inside the segment a-b (not at either end). */
function passesThrough(a: Point, b: Point, p: Point): boolean {
  if (a.y === b.y) return p.y === a.y && p.x > Math.min(a.x, b.x) && p.x < Math.max(a.x, b.x);
  return p.x === a.x && p.y > Math.min(a.y, b.y) && p.y < Math.max(a.y, b.y);
}

function crosses(s: Segment, t: Segment): boolean {
  const sH = s.a.y === s.b.y;
  const tH = t.a.y === t.b.y;
  if (sH === tH) return false;
  const h = sH ? s : t;
  const v = sH ? t : s;
  const x = v.a.x;
  const y = h.a.y;
  return x > Math.min(h.a.x, h.b.x) && x < Math.max(h.a.x, h.b.x) && y > Math.min(v.a.y, v.b.y) && y < Math.max(v.a.y, v.b.y);
}

/** Collinear and sharing more than a point. */
function overlaps(s: Segment, t: Segment): boolean {
  const sH = s.a.y === s.b.y;
  const tH = t.a.y === t.b.y;
  if (sH !== tH) return false;
  if (sH) return s.a.y === t.a.y && Math.min(s.a.x, s.b.x) < Math.max(t.a.x, t.b.x) && Math.min(t.a.x, t.b.x) < Math.max(s.a.x, s.b.x);
  return s.a.x === t.a.x && Math.min(s.a.y, s.b.y) < Math.max(t.a.y, t.b.y) && Math.min(t.a.y, t.b.y) < Math.max(s.a.y, s.b.y);
}

/** How badly the leg out of `pin` toward `next` disagrees with the pin's own lead: 0 when it runs
 * straight out along the lead, STUB_TURN when it turns right at the pin, BODY_HIT when it heads back
 * along the lead into the part's own body. */
function stubPenalty(pin: Point, next: Point, lead: LeadOutward | undefined): number {
  if (!lead) return 0;
  const along = lead.axis === 0 ? next.x - pin.x : next.y - pin.y;
  if (along === 0) return STUB_TURN;
  return Math.sign(along) === lead.sign ? 0 : BODY_HIT;
}

function scoreRoute(points: Point[], job: RouteJob, ctx: RouteContext, others: Segment[]): number {
  const last = points.length - 1;
  let score = BEND * (last - 1) + stubPenalty(points[0], points[1], job.a.lead) + stubPenalty(points[last], points[last - 1], job.b.lead);
  for (let i = 0; i < last; i++) {
    const p = points[i];
    const q = points[i + 1];
    score += Math.abs(p.x - q.x) + Math.abs(p.y - q.y);
    for (const o of ctx.obstacles) {
      if ((i === 0 && o.ownerId === job.a.ownerId) || (i === last - 1 && o.ownerId === job.b.ownerId)) continue;
      if (hitsRect(p, q, { x1: o.rect.x1 - CLEARANCE, y1: o.rect.y1 - CLEARANCE, x2: o.rect.x2 + CLEARANCE, y2: o.rect.y2 + CLEARANCE })) score += BODY_HIT;
    }
    for (const pin of ctx.pins) {
      if (pin.net === job.net) continue;
      if (passesThrough(p, q, pin.at)) score += FOREIGN_PIN;
    }
    const seg = { a: p, b: q, net: job.net };
    for (const t of others) {
      if (crosses(seg, t)) score += CROSSING;
      else if (t.net !== job.net && overlaps(seg, t)) score += FOREIGN_OVERLAP;
    }
  }
  return score;
}

function bestOf(candidates: Point[][], job: RouteJob, ctx: RouteContext, others: Segment[]): { points: Point[]; score: number } {
  let best = candidates[0];
  let bestScore = Infinity;
  for (const c of candidates) {
    const s = scoreRoute(c, job, ctx, others);
    if (s < bestScore) {
      bestScore = s;
      best = c;
    }
  }
  return { points: best, score: bestScore };
}

/**
 * Routes every wire as a straight run, an L, a Z or - only when nothing cheaper is clean - a
 * 4-bend detour, choosing by a fixed cost: through a body or another net's pin, along another net's
 * wire, across a wire, each bend, each turn right at a pin, and length. Candidate shapes are
 * enumerated rather than searched on a grid, so a route is always one of a few hand-drawn forms and
 * never a staircase. Shorter wires go first (they claim the direct paths; long runs detour around
 * them), then one more pass lets each wire reconsider against everyone's final shape. Deterministic.
 */
export function routeJobs(jobs: RouteJob[], ctx: RouteContext): Map<string, Point[]> {
  const manhattan = (j: RouteJob) => Math.abs(j.a.at.x - j.b.at.x) + Math.abs(j.a.at.y - j.b.at.y);
  const order = [...jobs].sort((p, q) => manhattan(p) - manhattan(q) || p.id.localeCompare(q.id));
  const netOf = new Map(jobs.map((j) => [j.id, j.net]));
  const routed = new Map<string, Point[]>();
  for (const job of order) if (job.fixed) routed.set(job.id, job.fixed);

  const othersFor = (id: string) => {
    const segs: Segment[] = [];
    for (const [otherId, pts] of routed) {
      if (otherId === id) continue;
      segs.push(...segmentsOf(pts, netOf.get(otherId)!));
    }
    return segs;
  };

  for (let pass = 0; pass < 2; pass++) {
    for (const job of order) {
      if (job.fixed) continue;
      const others = othersFor(job.id);
      const { cheap, detours } = candidateRoutes(job.a, job.b);
      let best = bestOf(cheap, job, ctx, others);
      if (best.score >= ESCALATE_AT + manhattan(job)) {
        const alt = bestOf(detours(), job, ctx, others);
        if (alt.score < best.score) best = alt;
      }
      routed.set(job.id, best.points);
    }
  }
  return routed;
}
