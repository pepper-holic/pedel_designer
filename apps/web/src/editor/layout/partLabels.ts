import { symbolRect } from "./metrics";
import { placeLabels, type LabelDirection, type LabelRequest, type Rect } from "./labels";
import { partValueLabel } from "../valueLabel";
import { terminalPosition } from "../geometry";
import { bboxOfParts } from "../blockGeometry";
import type { WireRoute } from "../routing/wirePolylines";
import type { CanvasEndpoints } from "../canvasEndpoints";
import type { BlockInstance, PartInstance } from "../types";

const CHAR_WIDTH = 6.4;
const LABEL_HEIGHT = 11;
const WIRE_OBSTACLE_HALF_WIDTH = 3;
/** The port tag CanvasBlockLayer draws over a block's port terminal: 7.5px italic text, 13px up. */
const PORT_TAG_CHAR_WIDTH = 4.6;
const PORT_TAG_HEIGHT = 9;
const PORT_TAG_LIFT = 13;

/** A part's own wiper indicator (the triangle + stub on top of the potentiometer symbol) occupies
 * the space directly above it, so its id/value should prefer the other three sides instead of
 * fighting the wiper for the same spot - see docs/plan-schematic-layout.md L4. */
const CORNERS: LabelDirection[] = ["upRight", "upLeft", "downRight", "downLeft"];
const ID_DIRECTIONS: Partial<Record<PartInstance["type"], LabelDirection[]>> = { potentiometer: ["down", "left", "right", "up", ...CORNERS] };
const DEFAULT_ID_DIRECTIONS: LabelDirection[] = ["up", "down", "left", "right", ...CORNERS];
const VALUE_DIRECTIONS: LabelDirection[] = ["down", "up", "left", "right", ...CORNERS];

function labelWidth(text: string, minWidth: number): number {
  return Math.max(minWidth, text.length * CHAR_WIDTH + 6);
}

/** Thin rectangles along every drawn wire segment, so a label never lands on top of a wire. */
export function wireObstacles(routes: WireRoute[]): Rect[] {
  return routes.flatMap(({ points }) =>
    points.slice(1).map((b, i) => {
      const a = points[i];
      return {
        x1: Math.min(a.x, b.x) - WIRE_OBSTACLE_HALF_WIDTH,
        x2: Math.max(a.x, b.x) + WIRE_OBSTACLE_HALF_WIDTH,
        y1: Math.min(a.y, b.y) - WIRE_OBSTACLE_HALF_WIDTH,
        y2: Math.max(a.y, b.y) + WIRE_OBSTACLE_HALF_WIDTH,
      };
    }),
  );
}

/** Geometry CanvasBlockLayer uses for an open block's dashed region and its title in the corner. */
const BLOCK_PADDING = 22;
const BLOCK_LABEL_HEADROOM = 18;
const BLOCK_TITLE_CHAR_WIDTH = 5.6;
const BLOCK_TITLE_HEIGHT = 12;

/** Where every open block's title is drawn - fixed text no label may sit on. */
export function blockTitleRects(parts: PartInstance[], blocks: BlockInstance[]): Rect[] {
  return blocks
    .filter((b) => !b.collapsed)
    .flatMap((b) => {
      const box = bboxOfParts(parts.filter((p) => p.blockId === b.id));
      if (!box) return [];
      const x = box.minX - BLOCK_PADDING + 8;
      const y = box.minY - BLOCK_PADDING - BLOCK_LABEL_HEADROOM;
      return [{ x1: x, x2: x + b.label.length * BLOCK_TITLE_CHAR_WIDTH + 4, y1: y, y2: y + BLOCK_TITLE_HEIGHT }];
    });
}

/** Where every open block's IN/OUT port tag is drawn - fixed text no label may sit on. */
export function portTagRects(parts: PartInstance[], blocks: BlockInstance[]): Rect[] {
  const byId = new Map(parts.map((p) => [p.id, p]));
  return blocks
    .filter((b) => !b.collapsed)
    .flatMap((b) => b.ports)
    .flatMap((port) => {
      const part = byId.get(port.terminal.partId);
      if (!part) return [];
      const at = terminalPosition(part, port.terminal.terminalId);
      const hw = (port.label.length * PORT_TAG_CHAR_WIDTH) / 2 + 1;
      return [{ x1: at.x - hw, x2: at.x + hw, y1: at.y - PORT_TAG_LIFT - PORT_TAG_HEIGHT + 2, y2: at.y - PORT_TAG_LIFT + 2 }];
    });
}

export interface PartLabelRequest extends LabelRequest {
  text: string;
}

export interface PartLabelLayout {
  requests: PartLabelRequest[];
  placed: Map<string, Rect>;
  /** The drawn wires alone, for a probe flag's leader-line check. */
  wires: Rect[];
  /** Everything the labels dodged, plus the labels themselves - what a later layer (probe flags, DC
   * tags) must in turn keep clear of. */
  occupied: Rect[];
}

/**
 * Every visible part's id and (if it has one) value label as placement requests, plus the fixed
 * obstacles they must clear - part bodies, drawn wires and port tags. Pure and React-free (see
 * layout/labels.ts) so the result can be checked directly in a test; CanvasLabelLayer only turns it
 * into SVG.
 */
export function partLabelPlacements(parts: PartInstance[], routes: WireRoute[], endpoints: CanvasEndpoints, blocks: BlockInstance[] = []): PartLabelLayout {
  const visible = parts.filter((p) => !endpoints.hidden.has(p.id) && p.type !== "ground");
  const wires = wireObstacles(routes);
  // Ground symbols get no label of their own but are still something a label must not sit on.
  const symbols = parts.filter((p) => !endpoints.hidden.has(p.id)).map((p) => symbolRect(p));
  const obstacles = [...symbols, ...wires, ...portTagRects(parts, blocks), ...blockTitleRects(parts, blocks)];

  const requests: PartLabelRequest[] = [];
  for (const part of visible) {
    const anchor = { x: part.x, y: part.y };
    const box = symbolRect(part);
    requests.push({ id: `id-${part.id}`, text: part.id, anchor, box, width: labelWidth(part.id, 38), height: LABEL_HEIGHT, directions: ID_DIRECTIONS[part.type] ?? DEFAULT_ID_DIRECTIONS });
    const value = partValueLabel(part);
    if (value) requests.push({ id: `value-${part.id}`, text: value, anchor, box, width: labelWidth(value, 48), height: LABEL_HEIGHT, directions: VALUE_DIRECTIONS });
  }

  const placed = placeLabels(requests, obstacles);
  return { requests, placed, wires, occupied: [...obstacles, ...placed.values()] };
}
