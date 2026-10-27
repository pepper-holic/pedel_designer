import type { FootprintDef, PadDef } from "./footprints";

export type Rotation = 0 | 90 | 180 | 270;
export type CopperLayer = "B.Cu" | "F.Cu";

export interface Point {
  x: number;
  y: number;
}

/** A pad where it ended up on the board, in board millimetres. */
export interface PlacedPad {
  ref: string;
  number: string;
  net: string;
  x: number;
  y: number;
  /** Copper diameter. */
  size: number;
  drill: number;
  square: boolean;
}

export interface PcbComponent {
  ref: string;
  value: string;
  footprint: FootprintDef;
  /** Where the footprint origin (pad 1) sits, and how it is turned (counter-clockwise, KiCad's sense). */
  x: number;
  y: number;
  rotation: Rotation;
  /** Kept where the placer put it: pots and jacks along the board edge. */
  fixed: boolean;
}

export interface Track {
  net: string;
  layer: CopperLayer;
  width: number;
  points: Point[];
}

export interface Via {
  net: string;
  x: number;
  y: number;
  size: number;
  drill: number;
}

/** A wire link on the component side, for a connection a single-sided board could not route. */
export interface WireLink {
  net: string;
  a: Point;
  b: Point;
}

export interface PcbRules {
  trackWidth: number;
  clearance: number;
  viaSize: number;
  viaDrill: number;
  /** Copper keeps at least this far from the board edge. */
  edgeClearance: number;
  /** Route on the bottom layer only; anything left over becomes a wire link. */
  singleSided: boolean;
}

export const DEFAULT_RULES: PcbRules = {
  // Generous on purpose: DIY boards are etched at home or ordered at the cheapest tier.
  trackWidth: 0.6,
  clearance: 0.4,
  viaSize: 1.2,
  viaDrill: 0.6,
  edgeClearance: 1,
  singleSided: true,
};

export interface PcbLayout {
  width: number;
  height: number;
  components: PcbComponent[];
  tracks: Track[];
  vias: Via[];
  links: WireLink[];
  /** Connections neither routed nor linked (double-sided boards report these instead of linking). */
  unrouted: { net: string; a: Point; b: Point }[];
  rules: PcbRules;
}

/** A footprint point turned by `rotation` (counter-clockwise on screen, y down - KiCad's convention). */
export function rotatePoint(x: number, y: number, rotation: Rotation): Point {
  switch (rotation) {
    case 0:
      return { x, y };
    case 90:
      return { x: y, y: -x };
    case 180:
      return { x: -x, y: -y };
    case 270:
      return { x: -y, y: x };
  }
}

export function placedPad(c: PcbComponent, pad: PadDef, net: string): PlacedPad {
  const p = rotatePoint(pad.x, pad.y, c.rotation);
  return { ref: c.ref, number: pad.number, net, x: c.x + p.x, y: c.y + p.y, size: pad.sizeMm, drill: pad.drillMm, square: pad.shape === "rect" };
}

/** Courtyard: the footprint's rotated bounding box plus a margin, in board coordinates. */
export function courtyard(c: PcbComponent, margin = 0.5): { minX: number; minY: number; maxX: number; maxY: number } {
  const pts: Point[] = [];
  for (const pad of c.footprint.pads) {
    const r = pad.sizeMm / 2;
    pts.push(rotatePoint(pad.x - r, pad.y - r, c.rotation), rotatePoint(pad.x + r, pad.y + r, c.rotation));
  }
  const b = c.footprint.body;
  if (b.kind === "rect") pts.push(rotatePoint(b.x, b.y, c.rotation), rotatePoint(b.x + b.w, b.y + b.h, c.rotation));
  else pts.push(rotatePoint(b.cx - b.r, b.cy - b.r, c.rotation), rotatePoint(b.cx + b.r, b.cy + b.r, c.rotation));
  const xs = pts.map((p) => p.x + c.x);
  const ys = pts.map((p) => p.y + c.y);
  return { minX: Math.min(...xs) - margin, minY: Math.min(...ys) - margin, maxX: Math.max(...xs) + margin, maxY: Math.max(...ys) + margin };
}

/** Shortest distance from a point to a segment. */
export function pointSegmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function segmentsIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
  const cross = (o: Point, p: Point, q: Point) => (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x);
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/** Shortest distance between two segments (0 when they cross). */
export function segmentDistance(a: Point, b: Point, c: Point, d: Point): number {
  if (segmentsIntersect(a, b, c, d)) return 0;
  return Math.min(pointSegmentDistance(a, c, d), pointSegmentDistance(b, c, d), pointSegmentDistance(c, a, b), pointSegmentDistance(d, a, b));
}
