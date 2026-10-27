import type { BoardNetlist } from "./boardNetlist";
import { boardPads } from "./pcbRoute";
import { courtyard, rotatePoint, type PcbLayout, type Point } from "./pcbTypes";
import { shapesToSvg, type Shape } from "./stripboardDrawing";

/**
 * The views of a routed board, as shapes in millimetres:
 * - `top`: the board as seen from the component side, copper of both layers showing through;
 * - `bottom-transfer`: bottom copper only, black on white, mirrored - print at 100% for toner
 *   transfer or photo-resist;
 * - `top-transfer`: top copper the same way, not mirrored (double-sided boards);
 * - `assembly`: outlines, references and values - the placement sheet for soldering.
 */
export type PcbView = "top" | "bottom-transfer" | "top-transfer" | "assembly";

export const PCB_MARGIN = 3;

const SOLDERMASK = "#1f4d2e";
const BOTTOM = "#d39b52";
const TOP = "#d1495b";
const PAD = "#e2bf6a";
const SILK = "#f2f3e8";
const LINK = "#7fb3e0";

export function drawPcb(layout: PcbLayout, board: BoardNetlist, view: PcbView): Shape[] {
  const shapes: Shape[] = [];
  const mirror = view === "bottom-transfer";
  const X = (x: number) => PCB_MARGIN + (mirror ? layout.width - x : x);
  const Y = (y: number) => PCB_MARGIN + y;
  const transfer = view === "bottom-transfer" || view === "top-transfer";
  const ink = "#000000";

  shapes.push({
    kind: "rect",
    x: PCB_MARGIN,
    y: PCB_MARGIN,
    w: layout.width,
    h: layout.height,
    fill: view === "top" ? SOLDERMASK : "#ffffff",
    stroke: view === "top" ? "#123320" : ink,
    sw: 0.2,
  });

  const trackLayers = view === "top" ? (["B.Cu", "F.Cu"] as const) : view === "bottom-transfer" ? (["B.Cu"] as const) : view === "top-transfer" ? (["F.Cu"] as const) : ([] as const);
  for (const layer of trackLayers) {
    for (const t of layout.tracks) {
      if (t.layer !== layer) continue;
      const color = transfer ? ink : layer === "B.Cu" ? BOTTOM : TOP;
      for (let i = 0; i + 1 < t.points.length; i++) {
        const a = t.points[i];
        const b = t.points[i + 1];
        shapes.push({ kind: "line", x1: X(a.x), y1: Y(a.y), x2: X(b.x), y2: Y(b.y), stroke: color, sw: t.width });
      }
    }
  }

  const pads = boardPads(layout.components, board);
  if (view !== "assembly") {
    for (const p of pads) {
      const fill = transfer ? ink : PAD;
      if (p.square) shapes.push({ kind: "rect", x: X(p.x) - p.size / 2, y: Y(p.y) - p.size / 2, w: p.size, h: p.size, fill });
      else shapes.push({ kind: "circle", cx: X(p.x), cy: Y(p.y), r: p.size / 2, fill });
      // A drill mark in the middle centres the bit when drilling by hand.
      shapes.push({ kind: "circle", cx: X(p.x), cy: Y(p.y), r: transfer ? 0.3 : p.drill / 2, fill: transfer ? "#ffffff" : "#1a1a1a" });
    }
    for (const v of layout.vias) {
      shapes.push({ kind: "circle", cx: X(v.x), cy: Y(v.y), r: v.size / 2, fill: transfer ? ink : "#c0c0c0" });
      shapes.push({ kind: "circle", cx: X(v.x), cy: Y(v.y), r: transfer ? 0.25 : v.drill / 2, fill: transfer ? "#ffffff" : "#1a1a1a" });
    }
  }
  if (transfer) return shapes;

  // Silkscreen: body outline and reference for every part.
  const silk = view === "top" ? SILK : ink;
  for (const c of layout.components) {
    const b = c.footprint.body;
    const at = (p: Point) => ({ x: X(c.x + p.x), y: Y(c.y + p.y) });
    if (b.kind === "circle") {
      const centre = at(rotatePoint(b.cx, b.cy, c.rotation));
      shapes.push({ kind: "circle", cx: centre.x, cy: centre.y, r: b.r, fill: "none", stroke: silk, sw: 0.15 });
    } else {
      const p1 = at(rotatePoint(b.x, b.y, c.rotation));
      const p2 = at(rotatePoint(b.x + b.w, b.y + b.h, c.rotation));
      shapes.push({ kind: "rect", x: Math.min(p1.x, p2.x), y: Math.min(p1.y, p2.y), w: Math.abs(p2.x - p1.x), h: Math.abs(p2.y - p1.y), fill: "none", stroke: silk, sw: 0.15 });
    }
    const box = courtyard(c, 0);
    const labelY = Y(box.minY) - 0.4;
    shapes.push({ kind: "text", x: X((box.minX + box.maxX) / 2), y: labelY, text: c.ref, size: 1.3, fill: silk, anchor: "middle", bold: true });
    if (view === "assembly") shapes.push({ kind: "text", x: X((box.minX + box.maxX) / 2), y: Y((box.minY + box.maxY) / 2) + 0.4, text: c.value, size: 1, fill: "#5c5f49", anchor: "middle" });
    if (c.footprint.polarized) {
      const plus = at(rotatePoint(c.footprint.pads[0].x, c.footprint.pads[0].y, c.rotation));
      shapes.push({ kind: "text", x: plus.x - 1.4, y: plus.y - 1, text: "+", size: 1.6, fill: silk, bold: true });
    }
  }
  if (view === "assembly") {
    for (const p of pads) shapes.push({ kind: "circle", cx: X(p.x), cy: Y(p.y), r: 0.5, fill: "none", stroke: ink, sw: 0.1 });
  }
  for (const l of layout.links) {
    shapes.push({ kind: "line", x1: X(l.a.x), y1: Y(l.a.y), x2: X(l.b.x), y2: Y(l.b.y), stroke: view === "top" ? LINK : ink, sw: 0.5, dash: 1 });
  }
  for (const u of layout.unrouted) {
    shapes.push({ kind: "line", x1: X(u.a.x), y1: Y(u.a.y), x2: X(u.b.x), y2: Y(u.b.y), stroke: "#ff4d4d", sw: 0.3, dash: 0.6 });
  }
  return shapes;
}

/** The view as a standalone SVG at true size. */
export function pcbSvg(layout: PcbLayout, board: BoardNetlist, view: PcbView): string {
  const background = view === "top" ? undefined : "#ffffff";
  return shapesToSvg(drawPcb(layout, board, view), layout.width + PCB_MARGIN * 2, layout.height + PCB_MARGIN * 2, 1, background);
}
