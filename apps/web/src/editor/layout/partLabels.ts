import { bodyRect } from "./metrics";
import { placeLabels, type LabelDirection, type LabelRequest, type Rect } from "./labels";
import { wireRoutes } from "../routing/wirePolylines";
import { partValueLabel } from "../valueLabel";
import type { CanvasEndpoints } from "../canvasEndpoints";
import type { PartInstance, Wire } from "../types";

const CHAR_WIDTH = 6.4;
const LABEL_HEIGHT = 11;
const WIRE_OBSTACLE_HALF_WIDTH = 3;

/** A part's own wiper indicator (the triangle + stub on top of the potentiometer symbol) occupies
 * the space directly above it, so its id/value should prefer the other three sides instead of
 * fighting the wiper for the same spot - see docs/plan-schematic-layout.md L4. */
const ID_DIRECTIONS: Partial<Record<PartInstance["type"], LabelDirection[]>> = { potentiometer: ["down", "left", "right", "up"] };
const DEFAULT_ID_DIRECTIONS: LabelDirection[] = ["up", "down", "left", "right"];
const VALUE_DIRECTIONS: LabelDirection[] = ["down", "up", "left", "right"];

function labelWidth(text: string, minWidth: number): number {
  return Math.max(minWidth, text.length * CHAR_WIDTH + 6);
}

/** Thin rectangles along every drawn wire segment, so a label never lands on top of a wire. */
function wireObstacles(wires: Wire[], endpoints: CanvasEndpoints): Rect[] {
  const routes = wireRoutes(wires, endpoints);
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

export interface PartLabelRequest extends LabelRequest {
  text: string;
}

/**
 * Every visible part's id and (if it has one) value label as placement requests, plus the fixed
 * obstacles they must clear - part bodies and drawn wires. Pure and React-free (see layout/labels.ts)
 * so the result can be checked directly in a test; CanvasLabelLayer only turns it into SVG.
 */
export function partLabelPlacements(parts: PartInstance[], wires: Wire[], endpoints: CanvasEndpoints): { requests: PartLabelRequest[]; placed: Map<string, Rect> } {
  const visible = parts.filter((p) => !endpoints.hidden.has(p.id) && p.type !== "ground");
  const obstacles = [...visible.map((p) => bodyRect(p)), ...wireObstacles(wires, endpoints)];

  const requests: PartLabelRequest[] = [];
  for (const part of visible) {
    requests.push({ id: `id-${part.id}`, text: part.id, anchor: { x: part.x, y: part.y }, width: labelWidth(part.id, 38), height: LABEL_HEIGHT, directions: ID_DIRECTIONS[part.type] ?? DEFAULT_ID_DIRECTIONS });
    const value = partValueLabel(part);
    if (value) requests.push({ id: `value-${part.id}`, text: value, anchor: { x: part.x, y: part.y }, width: labelWidth(value, 48), height: LABEL_HEIGHT, directions: VALUE_DIRECTIONS });
  }

  return { requests, placed: placeLabels(requests, obstacles) };
}
