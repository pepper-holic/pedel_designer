import type { BoardNetlist } from "./boardNetlist";
import { boardPads } from "./pcbRoute";
import { segmentDistance, type CopperLayer, type PcbLayout, type Point } from "./pcbTypes";

export interface PcbIssue {
  kind: "clearance" | "edge" | "drill" | "open" | "short";
  message: string;
  at: Point;
}

/** Copper as the checker sees it: a round blob or a fat segment on one layer, or on both. */
interface Item {
  net: string;
  layers: CopperLayer[];
  /** Segment ends (equal for a round item). */
  a: Point;
  b: Point;
  /** Half the copper width (radius for a pad or via); 0 for a square pad, whose outline is exact. */
  half: number;
  /** Half the side of a square pad (pad 1). */
  square?: number;
  label: string;
  pad?: { ref: string; number: string };
}

const EPS = 1e-3;
const MIN_DRILL_GAP = 0.25;

function squareEdges(c: Point, h: number): [Point, Point][] {
  const tl = { x: c.x - h, y: c.y - h };
  const tr = { x: c.x + h, y: c.y - h };
  const br = { x: c.x + h, y: c.y + h };
  const bl = { x: c.x - h, y: c.y + h };
  return [
    [tl, tr],
    [tr, br],
    [br, bl],
    [bl, tl],
  ];
}

const inSquare = (pt: Point, c: Point, h: number) => Math.abs(pt.x - c.x) <= h && Math.abs(pt.y - c.y) <= h;

/** Distance between two copper items' centre lines (outlines, for square pads). */
function distance(p: Item, q: Item): number {
  if (q.square !== undefined && p.square === undefined) return distance(q, p);
  if (p.square === undefined) return segmentDistance(p.a, p.b, q.a, q.b);
  if (inSquare(q.a, p.a, p.square) || inSquare(q.b, p.b, p.square)) return 0;
  const edges = squareEdges(p.a, p.square);
  if (q.square === undefined) return Math.min(...edges.map(([a, b]) => segmentDistance(a, b, q.a, q.b)));
  const other = squareEdges(q.a, q.square);
  return Math.min(...edges.flatMap(([a, b]) => other.map(([c, d]) => segmentDistance(a, b, c, d))));
}

const fmt = (p: Point) => `(${p.x.toFixed(1)}, ${p.y.toFixed(1)})mm`;

/**
 * Design-rule check of a routed board, from geometry alone (plan Stage E-3) - it does not trust the
 * router's grid. Clearance between copper of different nets on each layer, copper to board edge,
 * hole to hole, and connectivity: every net's pads joined by copper (or a wire link), no two nets
 * touching.
 */
export function checkPcb(layout: PcbLayout, board: BoardNetlist): PcbIssue[] {
  const issues: PcbIssue[] = [];
  const { rules } = layout;
  const both: CopperLayer[] = ["B.Cu", "F.Cu"];
  const pads = boardPads(layout.components, board);
  const items: Item[] = [];
  for (const p of pads) {
    const net = p.net || `NC:${p.ref}.${p.number}`;
    const shape = p.square ? { half: 0, square: p.size / 2 } : { half: p.size / 2 };
    items.push({ net, layers: both, a: p, b: p, ...shape, label: `${p.ref}.${p.number}`, pad: { ref: p.ref, number: p.number } });
  }
  for (const v of layout.vias) items.push({ net: v.net, layers: both, a: v, b: v, half: v.size / 2, label: `비아 ${fmt(v)}` });
  for (const t of layout.tracks) {
    for (let i = 0; i + 1 < t.points.length; i++) items.push({ net: t.net, layers: [t.layer], a: t.points[i], b: t.points[i + 1], half: t.width / 2, label: `${t.net} 트랙` });
  }

  // Clearance, and copper connectivity in the same sweep.
  const parent = items.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const join = (i: number, j: number) => {
    parent[find(i)] = find(j);
  };
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const p = items[i];
      const q = items[j];
      if (!p.layers.some((l) => q.layers.includes(l))) continue;
      const gap = distance(p, q) - p.half - q.half;
      if (gap <= EPS) {
        join(i, j);
        if (p.net !== q.net) issues.push({ kind: "short", message: `${p.label}와(과) ${q.label}이(가) 닿아 단락됩니다.`, at: p.a });
      } else if (p.net !== q.net && gap < rules.clearance - EPS) {
        issues.push({ kind: "clearance", message: `${p.label} ↔ ${q.label}: 간격 ${gap.toFixed(2)}mm < ${rules.clearance}mm`, at: p.a });
      }
    }
  }

  // Wire links join pads electrically.
  const padIndex = (pt: Point) => items.findIndex((it) => it.pad && Math.hypot(it.a.x - pt.x, it.a.y - pt.y) < EPS);
  for (const link of layout.links) {
    const a = padIndex(link.a);
    const b = padIndex(link.b);
    if (a >= 0 && b >= 0) join(a, b);
  }

  // Each net's pads in one copper group.
  const groupOf = new Map<string, number>();
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (!it.pad || it.net.startsWith("NC:")) continue;
    const g = find(i);
    const seen = groupOf.get(it.net);
    if (seen === undefined) groupOf.set(it.net, g);
    else if (seen !== g) {
      issues.push({ kind: "open", message: `${it.net} 넷이 ${it.label}에서 끊겨 있습니다.`, at: it.a });
      groupOf.set(it.net, g);
    }
  }

  // Copper to the board edge.
  for (const it of items) {
    for (const pt of [it.a, it.b]) {
      const edge = Math.min(pt.x, pt.y, layout.width - pt.x, layout.height - pt.y) - it.half - (it.square ?? 0);
      if (edge < rules.edgeClearance - EPS) {
        issues.push({ kind: "edge", message: `${it.label}이(가) 보드 가장자리에 너무 가깝습니다 (${edge.toFixed(2)}mm).`, at: pt });
        break;
      }
    }
  }

  // Holes far enough apart to drill.
  const holes = [...pads.map((p) => ({ ...p, label: `${p.ref}.${p.number}` })), ...layout.vias.map((v) => ({ ...v, label: `비아 ${fmt(v)}` }))];
  for (let i = 0; i < holes.length; i++) {
    for (let j = i + 1; j < holes.length; j++) {
      const gap = Math.hypot(holes[i].x - holes[j].x, holes[i].y - holes[j].y) - holes[i].drill / 2 - holes[j].drill / 2;
      if (gap < MIN_DRILL_GAP) issues.push({ kind: "drill", message: `${holes[i].label}와(과) ${holes[j].label}의 구멍이 겹칩니다.`, at: holes[i] });
    }
  }

  for (const u of layout.unrouted) issues.push({ kind: "open", message: `${u.net} 넷의 한 연결을 배선하지 못했습니다 ${fmt(u.a)} → ${fmt(u.b)}.`, at: u.a });
  return dedupe(issues);
}

function dedupe(issues: PcbIssue[]): PcbIssue[] {
  const seen = new Set<string>();
  return issues.filter((i) => (seen.has(i.message) ? false : (seen.add(i.message), true)));
}

