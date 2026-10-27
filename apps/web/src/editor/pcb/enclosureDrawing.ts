import { faceSize, type DrillHole, type EnclosureSpec, type Face } from "./enclosure";
import { shapesToSvg, type Shape } from "./stripboardDrawing";

const INK = "#191a10";
const FOLD = "#8a8a7a";
const BAD = "#d1495b";

/** Where a point on a face lands on the unfolded sheet: top face in the middle, sides folded out. */
export function toSheet(enclosure: EnclosureSpec, face: Face, x: number, y: number): { x: number; y: number } {
  const { width: W, height: H } = enclosure;
  switch (face) {
    case "top":
      return { x: H + x, y: H + y };
    case "end":
      return { x: H + x, y: H - y };
    case "right":
      return { x: H + W + y, y: H + x };
    case "left":
      return { x: H - y, y: H + x };
  }
}

/** The inverse for a drag: a sheet-space movement as a change in the face's own coordinates. */
export function sheetDeltaToFace(face: Face, dx: number, dy: number): { dx: number; dy: number } {
  switch (face) {
    case "top":
      return { dx, dy };
    case "end":
      return { dx, dy: -dy };
    case "right":
      return { dx: dy, dy: dx };
    case "left":
      return { dx: dy, dy: -dx };
  }
}

export function sheetSize(enclosure: EnclosureSpec): { w: number; h: number } {
  return { w: enclosure.width + 2 * enclosure.height, h: enclosure.length + enclosure.height };
}

/**
 * The box unfolded around its top face, with every hole as a circle, a centre cross to punch and
 * its diameter. Holes listed in `bad` are drawn red.
 */
export function drawEnclosure(enclosure: EnclosureSpec, holes: DrillHole[], bad: Set<string> = new Set()): Shape[] {
  const { width: W, length: L, height: H } = enclosure;
  const shapes: Shape[] = [
    { kind: "rect", x: H, y: H, w: W, h: L, fill: "#ffffff", stroke: INK, sw: 0.3 },
    { kind: "rect", x: H, y: 0, w: W, h: H, fill: "#ffffff", stroke: INK, sw: 0.3 },
    { kind: "rect", x: H + W, y: H, w: H, h: L, fill: "#ffffff", stroke: INK, sw: 0.3 },
    { kind: "rect", x: 0, y: H, w: H, h: L, fill: "#ffffff", stroke: INK, sw: 0.3 },
  ];
  // Fold lines: the top face's edges.
  for (const [x1, y1, x2, y2] of [
    [H, H, H + W, H],
    [H, H, H, H + L],
    [H + W, H, H + W, H + L],
  ]) {
    shapes.push({ kind: "line", x1, y1, x2, y2, stroke: FOLD, sw: 0.25, dash: 1.5 });
  }
  const faceLabel = (face: Face, text: string) => {
    const { w, h } = faceSize(enclosure, face);
    const centre = toSheet(enclosure, face, w / 2, face === "top" ? h - 4 : h - 3);
    shapes.push({ kind: "text", x: centre.x, y: centre.y, text, size: 2.6, fill: FOLD, anchor: "middle" });
  };
  faceLabel("top", `${enclosure.id} 윗면`);
  faceLabel("end", "끝면");
  faceLabel("right", "오른쪽");
  faceLabel("left", "왼쪽");

  for (const hole of holes) {
    const c = toSheet(enclosure, hole.face, hole.x, hole.y);
    const color = bad.has(hole.id) ? BAD : INK;
    const r = hole.diameter / 2;
    shapes.push({ kind: "circle", cx: c.x, cy: c.y, r, fill: "#ffffff", stroke: color, sw: 0.3, part: hole.id });
    shapes.push({ kind: "line", x1: c.x - r - 1.5, y1: c.y, x2: c.x + r + 1.5, y2: c.y, stroke: color, sw: 0.15, part: hole.id });
    shapes.push({ kind: "line", x1: c.x, y1: c.y - r - 1.5, x2: c.x, y2: c.y + r + 1.5, stroke: color, sw: 0.15, part: hole.id });
    shapes.push({ kind: "text", x: c.x, y: c.y + r + 3.6, text: `${hole.label} Ø${hole.diameter}`, size: 2.3, fill: color, anchor: "middle", bold: true });
  }
  return shapes;
}

/** True-size sheet to print at 100%, cut out and tape onto the box. */
export function enclosureSvg(enclosure: EnclosureSpec, holes: DrillHole[]): string {
  const { w, h } = sheetSize(enclosure);
  return shapesToSvg(drawEnclosure(enclosure, holes), w, h, 1, "#ffffff");
}
