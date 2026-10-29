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
  /** Segments on two different wires of the SAME net that run close together, parallel, and overlap
   * in range - the same node drawn as two side-by-side lines instead of one shared trunk (see
   * docs/plan-schematic-layout.md L3). Coincident segments (the actual point of a shared trunk - same
   * offset) are not counted, and neither are segments merely sharing a net from opposite ends of the
   * schematic (same offset range, but far apart - e.g. two unrelated ground drops); 0 unless `netOf`
   * is given. */
  parallelDuplicates: number;
}

/** How close two same-net parallel segments have to run to read as "the same line drawn twice"
 * rather than two unrelated same-net connections that happen to share an x/y range. */
const NEAR_DUPLICATE_DISTANCE = 60;

/** Half-extents of each symbol's drawn body in its own (unrotated) frame - see symbols.tsx. */
const SYMBOL_HALF: Record<PartInstance["type"], { w: number; h: number }> = {
  resistor: { w: 22, h: 12 },
  capacitor: { w: 10, h: 14 },
  inductor: { w: 20, h: 10 },
  diode: { w: 10, h: 12 },
  bjt: { w: 24, h: 24 },
  jfet: { w: 24, h: 24 },
  opamp: { w: 20, h: 24 },
  vsource: { w: 26, h: 26 },
  ground: { w: 14, h: 12 },
  potentiometer: { w: 22, h: 14 },
  pickup: { w: 22, h: 14 },
  spst: { w: 16, h: 10 },
  spdt: { w: 16, h: 14 },
  dpdt: { w: 16, h: 34 },
  blade3: { w: 16, h: 16 },
  blade5: { w: 16, h: 16 },
  rotary6: { w: 16, h: 34 },
  coupledInductors: { w: 22, h: 24 },
};

/** The area a wire of another net must keep out of: the symbol's drawn body together with its own
 * lead stubs out to each pin, so a foreign wire never crosses a lead (which would read as a join).
 * The pins themselves sit on this rectangle's edge, not inside it, so a wire ending at one is clear. */
export function symbolRect(part: PartInstance): { x1: number; y1: number; x2: number; y2: number } {
  const half = SYMBOL_HALF[part.type];
  const sideways = part.rotation === 90 || part.rotation === 270;
  let hw = sideways ? half.h : half.w;
  let hh = sideways ? half.w : half.h;
  for (const t of PART_DEFS[part.type].terminals) {
    const at = terminalPosition(part, t.id);
    hw = Math.max(hw, Math.abs(at.x - part.x));
    hh = Math.max(hh, Math.abs(at.y - part.y));
  }
  return { x1: part.x - hw, y1: part.y - hh, x2: part.x + hw, y2: part.y + hh };
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

/** Quality numbers for a drawn circuit, given each wire's polyline (default: the plain 2-bend route).
 * `netOf` (wire id -> net id) is only needed for the parallelDuplicates count. */
export function layoutMetrics(snapshot: CircuitSnapshot, polylines?: Point[][], netOf?: (wireId: string) => string | undefined): LayoutMetrics {
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
  let parallelDuplicates = 0;
  if (netOf) {
    const netOfWire = snapshot.wires.map((w) => netOf(w.id));
    for (let i = 0; i < segs.length; i++) {
      const s1 = segs[i];
      const horizontal1 = s1.a.y === s1.b.y;
      const net1 = netOfWire[s1.wi];
      if (!net1) continue;
      for (let j = i + 1; j < segs.length; j++) {
        const s2 = segs[j];
        if (s1.wi === s2.wi) continue;
        if (netOfWire[s2.wi] !== net1) continue;
        const horizontal2 = s2.a.y === s2.b.y;
        if (horizontal1 !== horizontal2) continue;
        if (horizontal1) {
          if (s1.a.y === s2.a.y) continue; // same offset - the shared trunk itself, not a duplicate
          if (Math.abs(s1.a.y - s2.a.y) > NEAR_DUPLICATE_DISTANCE) continue;
          if (Math.min(s1.a.x, s1.b.x) < Math.max(s2.a.x, s2.b.x) && Math.min(s2.a.x, s2.b.x) < Math.max(s1.a.x, s1.b.x)) parallelDuplicates++;
        } else {
          if (s1.a.x === s2.a.x) continue;
          if (Math.abs(s1.a.x - s2.a.x) > NEAR_DUPLICATE_DISTANCE) continue;
          if (Math.min(s1.a.y, s1.b.y) < Math.max(s2.a.y, s2.b.y) && Math.min(s2.a.y, s2.b.y) < Math.max(s1.a.y, s1.b.y)) parallelDuplicates++;
        }
      }
    }
  }
  return { crossings, wireLength, bodyHits, parallelDuplicates };
}
