import { PART_DEFS } from "./partDefs";
import type { PartInstance, Rotation } from "./types";

export const GRID_SIZE = 10;

export function snapToGrid(value: number): number {
  return Math.round(value / GRID_SIZE) * GRID_SIZE;
}

export function rotateClockwise(rotation: Rotation): Rotation {
  return ((rotation + 90) % 360) as Rotation;
}

/** Rotates a local offset (dx, dy) by `degrees` clockwise around the origin. */
export function rotateOffset(dx: number, dy: number, degrees: number): { x: number; y: number } {
  const rad = (degrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return { x: dx * cos - dy * sin, y: dx * sin + dy * cos };
}

/** World-space position of a part's terminal, accounting for its rotation. */
export function terminalPosition(part: PartInstance, terminalId: string): { x: number; y: number } {
  const terminal = PART_DEFS[part.type].terminals.find((t) => t.id === terminalId)!;
  const rotated = rotateOffset(terminal.dx, terminal.dy, part.rotation);
  return { x: part.x + rotated.x, y: part.y + rotated.y };
}

export interface CanvasView {
  zoom: number;
  panX: number;
  panY: number;
}

/**
 * Computes the pan/zoom needed to zoom by `factor` while keeping the world point under
 * `cursor` (screen coordinates) fixed on screen - the standard "zoom toward the mouse" trick.
 * Clamps the resulting zoom to [minZoom, maxZoom].
 */
export function zoomAroundPoint(view: CanvasView, cursor: { x: number; y: number }, factor: number, minZoom: number, maxZoom: number): CanvasView {
  const nextZoom = Math.min(maxZoom, Math.max(minZoom, view.zoom * factor));
  const worldX = (cursor.x - view.panX) / view.zoom;
  const worldY = (cursor.y - view.panY) / view.zoom;
  return { zoom: nextZoom, panX: cursor.x - worldX * nextZoom, panY: cursor.y - worldY * nextZoom };
}

export interface Point {
  x: number;
  y: number;
}

/**
 * The waypoints of a 2-bend orthogonal (Manhattan) path between two points, picking
 * horizontal-first or vertical-first based on which axis has more distance to cover - a simple
 * heuristic, not an obstacle-avoiding auto-router.
 */
export function orthogonalPoints(a: Point, b: Point): Point[] {
  const dx = Math.abs(b.x - a.x);
  const dy = Math.abs(b.y - a.y);
  if (dx === 0 || dy === 0) return [a, b]; // already axis-aligned - no bend, and no degenerate zero-length middle segment
  if (dx > dy) {
    const midX = (a.x + b.x) / 2;
    return [a, { x: midX, y: a.y }, { x: midX, y: b.y }, b];
  }
  const midY = (a.y + b.y) / 2;
  return [a, { x: a.x, y: midY }, { x: b.x, y: midY }, b];
}

/** SVG path `d` string for a straight (no wire-crossing hops) orthogonal path between two points. */
export function orthogonalPath(a: Point, b: Point): string {
  const pts = orthogonalPoints(a, b);
  return pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
}

const HOP_RADIUS = 6;

interface Segment {
  wireIndex: number;
  segmentIndex: number;
  a: Point;
  b: Point;
  horizontal: boolean;
}

/** Strict-interior crossing point of a horizontal segment `h` and a vertical segment `v`, or null if they don't truly cross (parallel lines, or they only touch at a shared endpoint - a real junction, not a crossing). */
function crossingPoint(h: Segment, v: Segment): Point | null {
  const y = h.a.y;
  const x = v.a.x;
  const hMin = Math.min(h.a.x, h.b.x);
  const hMax = Math.max(h.a.x, h.b.x);
  const vMin = Math.min(v.a.y, v.b.y);
  const vMax = Math.max(v.a.y, v.b.y);
  if (x <= hMin || x >= hMax || y <= vMin || y >= vMax) return null;
  return { x, y };
}

function segmentsOf(points: Point[], wireIndex: number): Segment[] {
  const segments: Segment[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    segments.push({ wireIndex, segmentIndex: i, a: points[i], b: points[i + 1], horizontal: points[i].y === points[i + 1].y });
  }
  return segments;
}

/** Builds a segment's path fragment, inserting a small bump (quadratic-bezier "hop") wherever another wire's crossing point falls strictly inside it - the schematic convention for "these wires don't connect". The hop always bulges toward -y (horizontal segments) or -x (vertical segments), independent of the segment's own direction of travel, so the visual result is deterministic regardless of wire declaration order. */
function segmentPathWithHops(a: Point, b: Point, horizontal: boolean, hopPositions: number[]): string {
  if (hopPositions.length === 0) return ` L${b.x},${b.y}`;
  const dir = horizontal ? Math.sign(b.x - a.x) : Math.sign(b.y - a.y);
  const sorted = [...hopPositions].sort((p, q) => dir * (p - q));

  let d = "";
  for (const pos of sorted) {
    if (horizontal) {
      d += ` L${pos - dir * HOP_RADIUS},${a.y} Q${pos},${a.y - HOP_RADIUS} ${pos + dir * HOP_RADIUS},${a.y}`;
    } else {
      d += ` L${a.x},${pos - dir * HOP_RADIUS} Q${a.x - HOP_RADIUS},${pos} ${a.x},${pos + dir * HOP_RADIUS}`;
    }
  }
  d += ` L${b.x},${b.y}`;
  return d;
}

/**
 * Renders every wire's orthogonal path in one pass, detecting true mid-path crossings between
 * different wires (as opposed to wires that meet at a shared terminal, which is a real electrical
 * junction handled separately by the junction dots) and drawing a small hop/bump on whichever
 * segment is vertical at that point - a fixed, order-independent rule so the visual result doesn't
 * depend on which wire happens to be declared first.
 */
export function computeWirePaths(endpoints: [Point, Point][]): string[] {
  const pointLists = endpoints.map(([a, b]) => orthogonalPoints(a, b));
  const allSegments = pointLists.flatMap((points, wireIndex) => segmentsOf(points, wireIndex));
  const horizontals = allSegments.filter((s) => s.horizontal);
  const verticals = allSegments.filter((s) => !s.horizontal);

  const hopsByKey = new Map<string, number[]>();
  for (const h of horizontals) {
    for (const v of verticals) {
      if (h.wireIndex === v.wireIndex) continue;
      const cp = crossingPoint(h, v);
      if (!cp) continue;
      const key = `${v.wireIndex}:${v.segmentIndex}`;
      if (!hopsByKey.has(key)) hopsByKey.set(key, []);
      hopsByKey.get(key)!.push(cp.y);
    }
  }

  return pointLists.map((points, wireIndex) => {
    let d = `M${points[0].x},${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
      const horizontal = points[i].y === points[i + 1].y;
      const hops = hopsByKey.get(`${wireIndex}:${i}`) ?? [];
      d += segmentPathWithHops(points[i], points[i + 1], horizontal, hops);
    }
    return d;
  });
}
