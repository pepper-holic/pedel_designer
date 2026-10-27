import { laneOffsetFor, orthogonalPoints, terminalPosition, type Point } from "../geometry";
import { PART_DEFS } from "../partDefs";
import type { CircuitSnapshot } from "../historyStack";
import type { PartInstance } from "../types";

export interface LayoutMetrics {
  crossings: number;
  /** Total Manhattan length of every drawn wire. */
  wireLength: number;
  /** Wire segments that run through some other part's body. */
  bodyHits: number;
}

/** A part's body without its terminal stubs: the area a wire should not run through. */
export function bodyRect(part: PartInstance): { x1: number; y1: number; x2: number; y2: number } {
  const ts = PART_DEFS[part.type].terminals.map((t) => terminalPosition(part, t.id));
  const xs = ts.map((t) => t.x - part.x);
  const ys = ts.map((t) => t.y - part.y);
  const hw = Math.max(8, Math.max(...xs.map(Math.abs)) - 8);
  const hh = Math.max(8, Math.max(...ys.map(Math.abs)) - 8);
  return { x1: part.x - hw, y1: part.y - hh, x2: part.x + hw, y2: part.y + hh };
}

function segmentHitsRect(a: Point, b: Point, r: { x1: number; y1: number; x2: number; y2: number }): boolean {
  if (a.y === b.y) return a.y > r.y1 && a.y < r.y2 && Math.max(a.x, b.x) > r.x1 && Math.min(a.x, b.x) < r.x2;
  return a.x > r.x1 && a.x < r.x2 && Math.max(a.y, b.y) > r.y1 && Math.min(a.y, b.y) < r.y2;
}

/** Quality numbers for a drawn circuit, given each wire's polyline (default: the plain 2-bend route). */
export function layoutMetrics(snapshot: CircuitSnapshot, polylines?: Point[][]): LayoutMetrics {
  const byId = new Map(snapshot.parts.map((p) => [p.id, p]));
  const lines =
    polylines ??
    snapshot.wires.map((w, i) => orthogonalPoints(terminalPosition(byId.get(w.a.partId)!, w.a.terminalId), terminalPosition(byId.get(w.b.partId)!, w.b.terminalId), laneOffsetFor(i)));
  const segs = lines.flatMap((pts, wi) => pts.slice(1).map((p, i) => ({ wi, a: pts[i], b: p })));
  let crossings = 0;
  for (const h of segs) {
    if (h.a.y !== h.b.y) continue;
    for (const v of segs) {
      if (v.wi === h.wi || v.a.x !== v.b.x || v.a.y === v.b.y) continue;
      const x = v.a.x;
      const y = h.a.y;
      if (x > Math.min(h.a.x, h.b.x) && x < Math.max(h.a.x, h.b.x) && y > Math.min(v.a.y, v.b.y) && y < Math.max(v.a.y, v.b.y)) crossings++;
    }
  }
  const wireLength = segs.reduce((sum, s) => sum + Math.abs(s.a.x - s.b.x) + Math.abs(s.a.y - s.b.y), 0);
  let bodyHits = 0;
  const wireParts = snapshot.wires.map((w) => new Set([w.a.partId, w.b.partId]));
  for (const s of segs) {
    for (const p of snapshot.parts) {
      if (p.type === "ground" || wireParts[s.wi].has(p.id)) continue;
      if (segmentHitsRect(s.a, s.b, bodyRect(p))) bodyHits++;
    }
  }
  return { crossings, wireLength, bodyHits };
}
