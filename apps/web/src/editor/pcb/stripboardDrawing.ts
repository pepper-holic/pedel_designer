import { FOOTPRINTS } from "./footprints";
import { holeLabel, rowLabel, type Hole, type StripboardLayout, type StripPlacement } from "./stripboardTypes";

/**
 * One drawing of a stripboard, as plain shapes in hole units (1 = 2.54mm). The interactive React
 * view and the 1:1 SVG export both render this list, so what is printed is what was checked.
 */
export type Shape =
  | { kind: "rect"; x: number; y: number; w: number; h: number; fill: string; stroke?: string; sw?: number; rx?: number; opacity?: number; part?: string }
  | { kind: "circle"; cx: number; cy: number; r: number; fill: string; stroke?: string; sw?: number; part?: string; hole?: Hole }
  | { kind: "line"; x1: number; y1: number; x2: number; y2: number; stroke: string; sw: number; part?: string; dash?: number }
  | { kind: "text"; x: number; y: number; text: string; size: number; fill: string; anchor?: "start" | "middle" | "end"; bold?: boolean; fontFamily?: string };

export type BoardSide = "component" | "copper";

/** Label margin around the board, in hole units. */
export const MARGIN = 1;
export const PITCH_MM = 2.54;

const BOARD = "#e8dcc0";
const COPPER = "#c8834a";
const HOLE = "#3b3226";
const CUT = "#d1495b";
const LABEL = "#5c5f49";

function bodyColor(p: StripPlacement): string {
  const id = p.footprintId;
  if (id.startsWith("r-")) return "#d8c08a";
  if (id.startsWith("cp-")) return "#3c5f9e";
  if (id.startsWith("c-disc")) return "#e0a33a";
  if (id.startsWith("c-")) return "#c0463a";
  if (id.startsWith("led")) return "#e04848";
  if (id.startsWith("d-")) return "#2f2f2f";
  if (id.startsWith("l-")) return "#4c7a4c";
  return "#262626";
}

/** Draws the board from one side. The copper side is mirrored, as it is when the board is turned over. */
export function drawStripboard(layout: StripboardLayout, side: BoardSide, offsets: Map<string, Hole> = new Map()): Shape[] {
  const shapes: Shape[] = [];
  const mirror = side === "copper";
  const cx = (col: number) => MARGIN + (mirror ? layout.cols - 1 - col : col) + 0.5;
  const cy = (row: number) => MARGIN + row + 0.5;

  shapes.push({ kind: "rect", x: MARGIN, y: MARGIN, w: layout.cols, h: layout.rows, fill: BOARD, stroke: "#b9a77f", sw: 0.06 });
  for (let row = 0; row < layout.rows; row++) {
    shapes.push({ kind: "rect", x: MARGIN + 0.04, y: MARGIN + row + 0.12, w: layout.cols - 0.08, h: 0.76, fill: COPPER, opacity: mirror ? 1 : 0.28 });
    shapes.push({ kind: "text", x: MARGIN - 0.35, y: cy(row) + 0.17, text: rowLabel(row), size: 0.5, fill: LABEL, anchor: "middle" });
  }
  for (let col = 0; col < layout.cols; col++) {
    if (col % 2 === 0 || layout.cols < 12) shapes.push({ kind: "text", x: cx(col), y: MARGIN - 0.3, text: String(col + 1), size: 0.45, fill: LABEL, anchor: "middle" });
  }
  const cutSet = new Set(layout.cuts.map((c) => `${c.row},${c.col}`));
  for (let row = 0; row < layout.rows; row++) {
    for (let col = 0; col < layout.cols; col++) {
      if (cutSet.has(`${row},${col}`)) {
        // A cut drills the copper out: on the copper side it is a gap in the strip.
        if (mirror) shapes.push({ kind: "rect", x: cx(col) - 0.42, y: MARGIN + row + 0.08, w: 0.84, h: 0.84, fill: BOARD });
        shapes.push({ kind: "circle", cx: cx(col), cy: cy(row), r: 0.3, fill: mirror ? BOARD : "none", stroke: CUT, sw: 0.1, hole: { row, col } });
        shapes.push({ kind: "line", x1: cx(col) - 0.22, y1: cy(row) - 0.22, x2: cx(col) + 0.22, y2: cy(row) + 0.22, stroke: CUT, sw: 0.09 });
      } else {
        shapes.push({ kind: "circle", cx: cx(col), cy: cy(row), r: 0.13, fill: HOLE, hole: { row, col } });
      }
    }
  }

  if (mirror) {
    // Copper side: only where to solder, cut and link - parts are on the other side.
    const solder = (h: Hole) => shapes.push({ kind: "circle", cx: cx(h.col), cy: cy(h.row), r: 0.24, fill: "#9a9a9a", stroke: "#6f6f6f", sw: 0.05 });
    for (const p of layout.placements) for (const pin of p.pins) solder(pin);
    for (const j of layout.jumpers) {
      solder(j.a);
      solder(j.b);
    }
    return shapes;
  }

  for (const j of layout.jumpers) {
    shapes.push({ kind: "line", x1: cx(j.a.col), y1: cy(j.a.row), x2: cx(j.b.col), y2: cy(j.b.row), stroke: "#5b6b7a", sw: 0.16 });
    for (const h of [j.a, j.b]) shapes.push({ kind: "circle", cx: cx(h.col), cy: cy(h.row), r: 0.17, fill: "#5b6b7a" });
  }

  for (const p of layout.placements) {
    const off = offsets.get(p.ref) ?? { row: 0, col: 0 };
    const pins = p.pins.map((pin) => ({ ...pin, x: cx(pin.col + off.col), y: cy(pin.row + off.row) }));
    const color = bodyColor(p);
    const label = (x: number, y: number, anchor: "start" | "middle" = "start") =>
      shapes.push({ kind: "text", x, y, text: p.ref, size: 0.45, fill: "#191a10", anchor, bold: true });

    if (p.kind === "flex") {
      for (const pin of pins) {
        shapes.push({ kind: "circle", cx: pin.x, cy: pin.y, r: 0.42, fill: "#f2f3e8", stroke: "#191a10", sw: 0.06, part: p.ref });
        // Flying leads are labelled by what they carry; which jack or pot is in the parts list.
        shapes.push({ kind: "text", x: pin.x, y: pin.y + 0.12, text: pin.net || "-", size: 0.26, fill: "#191a10", anchor: "middle", bold: true });
      }
      continue;
    }
    if (p.kind === "dip" && p.body) {
      const x = cx(p.body.colFrom + off.col) - 0.45;
      const y = cy(p.body.rowFrom + off.row) - 0.45;
      const w = p.body.colTo - p.body.colFrom + 0.9;
      const h = p.body.rowTo - p.body.rowFrom + 0.9;
      shapes.push({ kind: "rect", x, y, w, h, fill: "#262626", rx: 0.1, part: p.ref });
      shapes.push({ kind: "circle", cx: x + 0.35, cy: y + 0.35, r: 0.12, fill: "#bbbbbb" });
      for (const pin of pins) shapes.push({ kind: "circle", cx: pin.x, cy: pin.y, r: 0.16, fill: "#c0c0c0", part: p.ref });
      label(x + w / 2, y - 0.15, "middle");
      continue;
    }
    if (p.kind === "inline") {
      const top = Math.min(...pins.map((q) => q.y));
      const bottom = Math.max(...pins.map((q) => q.y));
      const x = pins[0].x;
      shapes.push({ kind: "rect", x: x - 0.55, y: top - 0.5, w: 1.1, h: bottom - top + 1, fill: "#262626", rx: 0.5, part: p.ref });
      for (const pin of pins) shapes.push({ kind: "circle", cx: pin.x, cy: pin.y, r: 0.16, fill: "#c0c0c0", part: p.ref });
      for (const pin of pins) shapes.push({ kind: "text", x: x - 0.75, y: pin.y + 0.13, text: pin.pad, size: 0.32, fill: LABEL, anchor: "end" });
      label(x + 0.7, (top + bottom) / 2 + 0.15);
      continue;
    }
    // Two leads along a column.
    const [a, b] = pins;
    shapes.push({ kind: "line", x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: "#8f8f8f", sw: 0.1, part: p.ref });
    const midY = (a.y + b.y) / 2;
    const fp = FOOTPRINTS[p.footprintId];
    if (fp?.body.kind === "circle") {
      const r = Math.min(fp.body.r / PITCH_MM, 1.6);
      shapes.push({ kind: "circle", cx: a.x, cy: midY, r, fill: color, stroke: "#191a10", sw: 0.05, part: p.ref });
      if (fp.polarized) {
        const plus = p.pins.find((q) => q.pad === "1")!;
        shapes.push({ kind: "text", x: a.x + r + 0.1, y: cy(plus.row + off.row) + 0.15, text: "+", size: 0.5, fill: "#191a10", bold: true });
      }
    } else {
      const len = Math.max(0.6, Math.min(Math.abs(b.y - a.y) - 0.5, (fp && fp.body.kind === "rect" ? fp.body.w : 6) / PITCH_MM));
      shapes.push({ kind: "rect", x: a.x - 0.3, y: midY - len / 2, w: 0.6, h: len, fill: color, stroke: "#191a10", sw: 0.05, rx: 0.2, part: p.ref });
      if (p.footprintId.startsWith("d-")) {
        // The band marks the cathode (pad 1).
        const k = p.pins.find((q) => q.pad === "1")!;
        const towardK = cy(k.row + off.row) < midY ? -1 : 1;
        shapes.push({ kind: "rect", x: a.x - 0.3, y: midY + towardK * (len / 2 - 0.12) - 0.06, w: 0.6, h: 0.12, fill: "#d9d9d9" });
      }
    }
    for (const pin of pins) shapes.push({ kind: "circle", cx: pin.x, cy: pin.y, r: 0.16, fill: "#c0c0c0", part: p.ref });
    label(a.x + 0.55, midY + 0.15);
  }
  return shapes;
}

function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Standalone SVG at true size (millimetres), for printing at 100% and transferring to the board. */
export function shapesToSvg(shapes: Shape[], widthUnits: number, heightUnits: number, mmPerUnit = PITCH_MM, background?: string): string {
  const body = shapes
    .map((s) => {
      switch (s.kind) {
        case "rect":
          return `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" fill="${s.fill}"${s.stroke ? ` stroke="${s.stroke}" stroke-width="${s.sw ?? 0.05}"` : ""}${s.rx ? ` rx="${s.rx}"` : ""}${s.opacity !== undefined ? ` opacity="${s.opacity}"` : ""}/>`;
        case "circle":
          return `<circle cx="${s.cx}" cy="${s.cy}" r="${s.r}" fill="${s.fill}"${s.stroke ? ` stroke="${s.stroke}" stroke-width="${s.sw ?? 0.05}"` : ""}/>`;
        case "line":
          return `<line x1="${s.x1}" y1="${s.y1}" x2="${s.x2}" y2="${s.y2}" stroke="${s.stroke}" stroke-width="${s.sw}" stroke-linecap="round"${s.dash ? ` stroke-dasharray="${s.dash} ${s.dash}"` : ""}/>`;
        case "text":
          return `<text x="${s.x}" y="${s.y}" font-size="${s.size}" fill="${s.fill}" font-family="${s.fontFamily ?? "sans-serif"}"${s.anchor ? ` text-anchor="${s.anchor}"` : ""}${s.bold ? ' font-weight="600"' : ""}>${escapeXml(s.text)}</text>`;
      }
    })
    .join("\n");
  const w = widthUnits * mmPerUnit;
  const h = heightUnits * mmPerUnit;
  const bg = background ? `<rect x="0" y="0" width="${widthUnits}" height="${heightUnits}" fill="${background}"/>\n` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="0 0 ${widthUnits} ${heightUnits}">\n${bg}${body}\n</svg>\n`;
}

/** Both sides, component side on top, as one printable 1:1 sheet. */
export function stripboardSheetSvg(layout: StripboardLayout): string {
  const w = layout.cols + MARGIN * 2;
  const h = layout.rows + MARGIN * 2;
  const top = drawStripboard(layout, "component");
  const bottom = drawStripboard(layout, "copper").map((s) => shift(s, h + 1));
  const titles: Shape[] = [
    { kind: "text", x: 0.2, y: h + 0.1, text: "부품면 (위에서 본 모습)", size: 0.5, fill: LABEL },
    { kind: "text", x: 0.2, y: 2 * h + 1.1, text: "동박면 (뒤집은 모습)", size: 0.5, fill: LABEL },
  ];
  return shapesToSvg([...top, ...bottom, ...titles], w, 2 * h + 1.5);
}

function shift(s: Shape, dy: number): Shape {
  switch (s.kind) {
    case "rect":
      return { ...s, y: s.y + dy };
    case "circle":
      return { ...s, cy: s.cy + dy };
    case "line":
      return { ...s, y1: s.y1 + dy, y2: s.y2 + dy };
    case "text":
      return { ...s, y: s.y + dy };
  }
}

/** The text a builder follows: board size, every cut and link, where each part goes. */
export function stripboardBuildNotes(layout: StripboardLayout): string {
  const lines = [
    `보드: ${layout.cols}열 × ${layout.rows}줄 (${(layout.cols * PITCH_MM).toFixed(1)} × ${(layout.rows * PITCH_MM).toFixed(1)} mm) - 스트립은 가로 방향`,
    "",
    `컷 ${layout.cuts.length}개 (부품면 기준 좌표): ${layout.cuts.map(holeLabel).join(", ") || "없음"}`,
    `점퍼 ${layout.jumpers.length}개: ${layout.jumpers.map((j) => `${holeLabel(j.a)}–${holeLabel(j.b)} (${j.net})`).join(", ") || "없음"}`,
    "",
    "부품:",
    ...layout.placements.map((p) => `  ${p.ref} ${p.value}: ${p.pins.map((pin) => `${pin.pad}→${holeLabel(pin)}`).join(", ")}`),
  ];
  return lines.join("\n");
}
