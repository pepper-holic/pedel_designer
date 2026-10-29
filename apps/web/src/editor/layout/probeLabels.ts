import { placeLabels, type LabelDirection, type Rect } from "./labels";

const CHAR_WIDTH = 6.4;
export const FLAG_HEIGHT = 15;
export const DC_TAG_HEIGHT = 13;
/** A flag hangs off a corner of its pin on a short leader, so it clears the wire through the pin. */
const FLAG_DIRECTIONS: LabelDirection[] = ["upRight", "upLeft", "downRight", "downLeft", "up", "down", "right", "left"];
const FLAG_GAP = 9;
const DC_DIRECTIONS: LabelDirection[] = ["downRight", "upRight", "downLeft", "upLeft", "down", "up"];
const DC_GAP = 5;
const LEADER_SAMPLES = 12;
/** The probe ring drawn on the pin - the leader starts inside it, so that stretch is not checked. */
const RING_RADIUS = 8;

export interface TagRequest {
  id: string;
  text: string;
  anchor: { x: number; y: number };
}

export function flagWidth(text: string): number {
  return text.length * CHAR_WIDTH + 8;
}

export function dcTagWidth(text: string): number {
  return text.length * CHAR_WIDTH + 6;
}

/**
 * Where each probe flag and each DC-voltage tag goes: probe flags first (they are what the user
 * asked to see), then DC tags in the gaps left, every one clear of `occupied` (part bodies, wires,
 * the part labels) and of each other. Pure, so the no-overlap guarantee can be tested directly.
 */
export function probeTagPlacements(flags: TagRequest[], dcTags: TagRequest[], occupied: Rect[], wires: Rect[] = []): Map<string, Rect> {
  // A flag's leader runs from the pin to the box; a candidate whose leader would cut across a wire
  // is passed over (the straight-line leader is sampled, skipping the ring around the pin itself).
  const leaderClear = (rect: Rect, req: { anchor: { x: number; y: number } }) => {
    const tip = nearestEdgePoint(rect, req.anchor);
    for (let k = 1; k < LEADER_SAMPLES; k++) {
      const t = k / LEADER_SAMPLES;
      const p = { x: req.anchor.x + (tip.x - req.anchor.x) * t, y: req.anchor.y + (tip.y - req.anchor.y) * t };
      if (Math.hypot(p.x - req.anchor.x, p.y - req.anchor.y) <= RING_RADIUS) continue;
      if (wires.some((w) => p.x > w.x1 && p.x < w.x2 && p.y > w.y1 && p.y < w.y2)) return false;
    }
    return true;
  };
  const flagRects = placeLabels(
    flags.map((f) => ({ id: f.id, anchor: f.anchor, width: flagWidth(f.text), height: FLAG_HEIGHT, directions: FLAG_DIRECTIONS })),
    occupied,
    FLAG_GAP,
    leaderClear,
  );
  const dcRects = placeLabels(
    dcTags.map((t) => ({ id: t.id, anchor: t.anchor, width: dcTagWidth(t.text), height: DC_TAG_HEIGHT, directions: DC_DIRECTIONS })),
    [...occupied, ...flagRects.values()],
    DC_GAP,
  );
  return new Map([...flagRects, ...dcRects]);
}

/** The point on `r`'s edge nearest `p` - where a flag's leader line meets its box. */
export function nearestEdgePoint(r: Rect, p: { x: number; y: number }): { x: number; y: number } {
  return { x: Math.min(Math.max(p.x, r.x1), r.x2), y: Math.min(Math.max(p.y, r.y1), r.y2) };
}
