export interface Rect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Centred on the anchor's side (up/down/left/right), or hung off one of its corners (the diagonal
 * ones - a flag on a leader line, which wants to sit clear of the wire running through the pin). */
export type LabelDirection = "up" | "down" | "left" | "right" | "upRight" | "upLeft" | "downRight" | "downLeft";

export interface LabelRequest {
  id: string;
  /** World-space point the label is attached to (a part's center, a terminal, ...). */
  anchor: { x: number; y: number };
  /** The thing the label belongs to, when it has a size (a part's symbol): candidate boxes are
   * measured out from this box's edges rather than from the anchor point, so a big symbol's label
   * sits just outside it instead of jumping tiers to clear it. */
  box?: Rect;
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

function rectAt(req: LabelRequest, direction: LabelDirection, baseGap: number, tier: number): Rect {
  const { anchor, width, height } = req;
  const off = baseGap + tier * TIER_STEP;
  // Measured from the anchor's own box when it has one, else from the anchor point itself.
  const box = req.box ?? { x1: anchor.x, x2: anchor.x, y1: anchor.y, y2: anchor.y };
  switch (direction) {
    case "up":
      return { x1: anchor.x - width / 2, x2: anchor.x + width / 2, y2: box.y1 - off, y1: box.y1 - off - height };
    case "down":
      return { x1: anchor.x - width / 2, x2: anchor.x + width / 2, y1: box.y2 + off, y2: box.y2 + off + height };
    case "left":
      return { x2: box.x1 - off, x1: box.x1 - off - width, y1: anchor.y - height / 2, y2: anchor.y + height / 2 };
    case "right":
      return { x1: box.x2 + off, x2: box.x2 + off + width, y1: anchor.y - height / 2, y2: anchor.y + height / 2 };
    case "upRight":
      return { x1: box.x2 + off, x2: box.x2 + off + width, y2: box.y1 - off, y1: box.y1 - off - height };
    case "upLeft":
      return { x2: box.x1 - off, x1: box.x1 - off - width, y2: box.y1 - off, y1: box.y1 - off - height };
    case "downRight":
      return { x1: box.x2 + off, x2: box.x2 + off + width, y1: box.y2 + off, y2: box.y2 + off + height };
    case "downLeft":
      return { x2: box.x1 - off, x1: box.x1 - off - width, y1: box.y2 + off, y2: box.y2 + off + height };
  }
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2;
}

/**
 * Greedy label placement: for each request, in order, tries its candidate directions (up/down/left/
 * right by default preference) at increasing distance from the anchor - nearest distance first, the
 * directions as tie-break within it - and takes the first box that
 * doesn't overlap a fixed obstacle (a wire segment, a part body, ...) or a label already placed
 * earlier in this same call, and that `accept` (an extra per-candidate test, e.g. "the leader line
 * to it crosses no wire") allows. A label whose every candidate collides still gets a position - its
 * first direction at the closest tier - rather than disappearing; some overlap beats an invisible
 * label.
 *
 * Pure and React-free so it can be unit tested directly; callers own turning the result into SVG.
 */
export function placeLabels(requests: LabelRequest[], obstacles: Rect[], baseGap = 4, accept?: (rect: Rect, req: LabelRequest) => boolean): Map<string, Rect> {
  const placed: Rect[] = [];
  const result = new Map<string, Rect>();
  for (const req of requests) {
    // Nearest tier first, the preferred direction breaking ties within a tier: a label belongs next
    // to its part, so a free spot beside it beats the favourite side four steps away.
    const firstFree = (test?: (rect: Rect) => boolean): Rect | null => {
      for (const tier of TIERS) {
        for (const direction of req.directions) {
          const rect = rectAt(req, direction, baseGap, tier);
          if (obstacles.some((o) => rectsOverlap(rect, o)) || placed.some((p) => rectsOverlap(rect, p))) continue;
          if (test && !test(rect)) continue;
          return rect;
        }
      }
      return null;
    };
    // A free spot that also passes `accept`; failing that, any free spot; failing that, overlap.
    const chosen = (accept ? firstFree((rect) => accept(rect, req)) : null) ?? firstFree();
    const final = chosen ?? rectAt(req, req.directions[0], baseGap, 0);
    placed.push(final);
    result.set(req.id, final);
  }
  return result;
}
