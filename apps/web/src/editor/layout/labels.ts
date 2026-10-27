export interface Rect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export type LabelDirection = "up" | "down" | "left" | "right";

export interface LabelRequest {
  id: string;
  /** World-space point the label is attached to (a part's center, a terminal, ...). */
  anchor: { x: number; y: number };
  width: number;
  height: number;
  /** Candidate directions in preference order - the first whose box clears every obstacle and every
   * earlier label wins, so a caller can keep a label's usual side as its first choice. */
  directions: LabelDirection[];
}

/** How many offset steps out from the anchor are tried per direction before giving up on it -
 * the plan's "2~3단 오프셋". */
const TIERS = [0, 1, 2, 3, 4];
const TIER_STEP = 14;

function rectAt(anchor: { x: number; y: number }, width: number, height: number, direction: LabelDirection, baseGap: number, tier: number): Rect {
  const off = baseGap + tier * TIER_STEP;
  switch (direction) {
    case "up":
      return { x1: anchor.x - width / 2, x2: anchor.x + width / 2, y2: anchor.y - off, y1: anchor.y - off - height };
    case "down":
      return { x1: anchor.x - width / 2, x2: anchor.x + width / 2, y1: anchor.y + off, y2: anchor.y + off + height };
    case "left":
      return { x2: anchor.x - off, x1: anchor.x - off - width, y1: anchor.y - height / 2, y2: anchor.y + height / 2 };
    case "right":
      return { x1: anchor.x + off, x2: anchor.x + off + width, y1: anchor.y - height / 2, y2: anchor.y + height / 2 };
  }
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2;
}

/**
 * Greedy label placement: for each request, in order, tries its candidate directions (up/down/left/
 * right by default preference) at increasing distance from the anchor, and takes the first box that
 * doesn't overlap a fixed obstacle (a wire segment, a part body, ...) or a label already placed
 * earlier in this same call. A label whose every candidate collides still gets a position - its
 * first direction at the closest tier - rather than disappearing; some overlap beats an invisible
 * label.
 *
 * Pure and React-free so it can be unit tested directly; callers own turning the result into SVG.
 */
export function placeLabels(requests: LabelRequest[], obstacles: Rect[], baseGap = 4): Map<string, Rect> {
  const placed: Rect[] = [];
  const result = new Map<string, Rect>();
  for (const req of requests) {
    let chosen: Rect | null = null;
    for (const direction of req.directions) {
      for (const tier of TIERS) {
        const rect = rectAt(req.anchor, req.width, req.height, direction, baseGap, tier);
        if (obstacles.some((o) => rectsOverlap(rect, o)) || placed.some((p) => rectsOverlap(rect, p))) continue;
        chosen = rect;
        break;
      }
      if (chosen) break;
    }
    const final = chosen ?? rectAt(req.anchor, req.width, req.height, req.directions[0], baseGap, 0);
    placed.push(final);
    result.set(req.id, final);
  }
  return result;
}
