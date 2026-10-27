import { PART_HALF_WIDTH, PART_HALF_HEIGHT } from "./partMetrics";
import type { BlockInstance, BlockPort, PartInstance, PortKind } from "./types";

export type PinSide = "left" | "right" | "top" | "bottom";

export const PORT_SIDE: Record<PortKind, PinSide> = {
  in: "left",
  aux: "left",
  out: "right",
  supply: "top",
  bias: "top",
  ground: "bottom",
};

/** Length of the pin stub outside the box; the wire attaches at its outer end. */
export const PIN_LENGTH = 14;
const PIN_SPACING = 26;
const MIN_WIDTH = 150;
const HEADER_HEIGHT = 30;
const KNOB_LINE = 13;

export interface PinLayout {
  port: BlockPort;
  side: PinSide;
  /** Where wires attach (outer end of the stub). */
  x: number;
  y: number;
  /** Where the stub meets the box edge. */
  edgeX: number;
  edgeY: number;
}

export interface BlockSymbolLayout {
  cx: number;
  cy: number;
  left: number;
  top: number;
  width: number;
  height: number;
  pins: PinLayout[];
}

export function bboxOfParts(parts: PartInstance[]): { minX: number; minY: number; maxX: number; maxY: number } | null {
  if (parts.length === 0) return null;
  return {
    minX: Math.min(...parts.map((p) => p.x - PART_HALF_WIDTH)),
    maxX: Math.max(...parts.map((p) => p.x + PART_HALF_WIDTH)),
    minY: Math.min(...parts.map((p) => p.y - PART_HALF_HEIGHT)),
    maxY: Math.max(...parts.map((p) => p.y + PART_HALF_HEIGHT)),
  };
}

/** Snaps to the 10px grid so a collapsed block's pins line up with part terminals. */
const snap = (v: number) => Math.round(v / 10) * 10;

/**
 * Geometry of a collapsed block's box: centred on its parts, tall enough for its busiest side's
 * pins and its knob list, with pins spread evenly along each side.
 */
export function blockSymbolLayout(block: BlockInstance, members: PartInstance[]): BlockSymbolLayout | null {
  const box = bboxOfParts(members);
  if (!box) return null;
  const bySide: Record<PinSide, BlockPort[]> = { left: [], right: [], top: [], bottom: [] };
  for (const port of block.ports) bySide[PORT_SIDE[port.kind]].push(port);

  const vertical = Math.max(2, bySide.left.length, bySide.right.length);
  const horizontal = Math.max(bySide.top.length, bySide.bottom.length);
  const width = Math.max(MIN_WIDTH, horizontal * 40 + 40);
  const height = Math.max(vertical * PIN_SPACING + 16, HEADER_HEIGHT + block.params.length * KNOB_LINE + 12);
  const cx = snap((box.minX + box.maxX) / 2);
  const cy = snap((box.minY + box.maxY) / 2);
  const left = cx - width / 2;
  const top = cy - height / 2;

  const pins: PinLayout[] = [];
  const spread = (ports: BlockPort[], side: PinSide) => {
    ports.forEach((port, i) => {
      if (side === "left" || side === "right") {
        const y = snap(top + ((i + 1) * height) / (ports.length + 1));
        const edgeX = side === "left" ? left : left + width;
        pins.push({ port, side, edgeX, edgeY: y, x: edgeX + (side === "left" ? -PIN_LENGTH : PIN_LENGTH), y });
      } else {
        const x = snap(left + ((i + 1) * width) / (ports.length + 1));
        const edgeY = side === "top" ? top : top + height;
        pins.push({ port, side, edgeX: x, edgeY, x, y: edgeY + (side === "top" ? -PIN_LENGTH : PIN_LENGTH) });
      }
    });
  };
  spread(bySide.left, "left");
  spread(bySide.right, "right");
  spread(bySide.top, "top");
  spread(bySide.bottom, "bottom");
  return { cx, cy, left, top, width, height, pins };
}

export const BLOCK_HEADER_HEIGHT = HEADER_HEIGHT;
export const BLOCK_KNOB_LINE = KNOB_LINE;
