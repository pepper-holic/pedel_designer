import { PART_HALF_HEIGHT, PART_HALF_WIDTH } from "./partMetrics";
import type { PartInstance, Wire } from "./types";

export interface SelectionBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * Ids of the parts whose body overlaps a rubber-band rectangle.
 *
 * Overlap rather than full containment: on a dense schematic, insisting the whole body be inside
 * means a careless drag silently misses parts whose labels stick out, and the user has no way to
 * tell which rule is in force.
 */
export function partsInBox(parts: PartInstance[], box: SelectionBox): string[] {
  // The drag can start from any corner, so normalise before comparing.
  const left = Math.min(box.x1, box.x2);
  const right = Math.max(box.x1, box.x2);
  const top = Math.min(box.y1, box.y2);
  const bottom = Math.max(box.y1, box.y2);

  return parts
    .filter(
      (p) =>
        p.x + PART_HALF_WIDTH >= left &&
        p.x - PART_HALF_WIDTH <= right &&
        p.y + PART_HALF_HEIGHT >= top &&
        p.y - PART_HALF_HEIGHT <= bottom,
    )
    .map((p) => p.id);
}

/**
 * Copies a set of parts (and the wires strictly between them) under a fresh id prefix.
 *
 * Wires with one end outside the selection are dropped rather than reattached: the copy would
 * otherwise share a node with the original, which is almost never what "duplicate this stage" means
 * and is invisible on the canvas once the copy is dragged away.
 */
export function cloneSelection(
  parts: PartInstance[],
  wires: Wire[],
  selectedIds: string[],
  offset: { dx: number; dy: number },
  idPrefix: string,
): { parts: PartInstance[]; wires: Wire[] } {
  const selected = new Set(selectedIds);
  const copiedParts = parts
    .filter((p) => selected.has(p.id))
    .map((p) => ({ ...p, id: `${idPrefix}_${p.id}`, x: p.x + offset.dx, y: p.y + offset.dy, params: { ...p.params } }));

  const copiedWires = wires
    .filter((w) => selected.has(w.a.partId) && selected.has(w.b.partId))
    .map((w) => ({
      id: `${idPrefix}_${w.id}`,
      a: { partId: `${idPrefix}_${w.a.partId}`, terminalId: w.a.terminalId },
      b: { partId: `${idPrefix}_${w.b.partId}`, terminalId: w.b.terminalId },
    }));

  return { parts: copiedParts, wires: copiedWires };
}
