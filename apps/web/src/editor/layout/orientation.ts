import { orthogonalPoints, rotateClockwise, terminalPosition, type Point } from "../geometry";
import { PART_DEFS } from "../partDefs";
import type { PartInstance, Rotation, Wire } from "../types";

/** How many drawn-length units a single mid-path crossing is worth - tuned well above the typical
 * saving from a shorter route, so the pass prefers an uncrossed, slightly longer wire. */
const CROSSING_PENALTY = 500;
/** Passes over every candidate part: direction choices interact (two neighbours can both want to
 * turn toward each other), so one sweep is not enough, but the plan caps it since each pass is
 * already a local, deterministic improvement and further passes converge quickly. */
const PASSES = 3;

/** Part types whose terminals are not symmetric about the horizontal axis, so a top-to-bottom flip
 * is a real alternative orientation rather than a no-op. */
const MIRRORABLE: ReadonlySet<PartInstance["type"]> = new Set(["opamp", "bjt", "jfet", "potentiometer"]);
/** Charged to a stack part (one hanging off the signal row) for lying horizontal: a shunt element is
 * drawn running away from the row it hangs on unless horizontal is clearly better for its wiring. */
const HORIZONTAL_STACK_PENALTY = 250;

export interface OrientationConstraints {
  /** Orientation already decided by a layout template - left exactly as is. */
  fixed?: ReadonlySet<string>;
  /** Series parts on a signal row (and feedback rungs): may flip end for end, never turn sideways. */
  keepAxis?: ReadonlySet<string>;
  /** Parts hanging off the signal row: drawn vertical unless horizontal is clearly better. */
  preferVertical?: ReadonlySet<string>;
}

interface Orientation {
  rotation: Rotation;
  mirror: boolean;
}

function orientationOf(part: PartInstance): Orientation {
  return { rotation: part.rotation, mirror: !!part.mirror };
}

/**
 * The alternative directions worth trying for a part, besides the one it already has.
 * Two-terminal parts get all four cardinal rotations: a real schematic draws a series element (R/C
 * in the signal path) horizontally but a shunt element (branching off to ground/rail) vertically, so
 * the part needs 90/270 as real candidates, not just the 180 flip - the score function (wire length +
 * crossings) already picks whichever one actually fits the wiring, no separate "is this a shunt"
 * classification needed. Parts with asymmetric terminal layouts (op-amp, BJT, JFET, pot) instead get
 * a mirror candidate, which keeps every pin's rotation-derived position but swaps which side
 * (top/bottom) each one draws on.
 */
function candidateOrientations(part: PartInstance, keepAxis: boolean): Orientation[] {
  const current = orientationOf(part);
  if (MIRRORABLE.has(part.type)) return [current, { ...current, mirror: !current.mirror }];
  if (PART_DEFS[part.type].terminals.length === 2) {
    const r90 = rotateClockwise(current.rotation);
    const r180 = rotateClockwise(r90);
    const r270 = rotateClockwise(r180);
    if (keepAxis) return [current, { rotation: r180, mirror: current.mirror }];
    return [current, { rotation: r90, mirror: current.mirror }, { rotation: r180, mirror: current.mirror }, { rotation: r270, mirror: current.mirror }];
  }
  return [current];
}

/** A two-terminal part lies along the x axis at 0/180 - its pins are at dx = +-30, dy = 0. */
function isHorizontal(rotation: Rotation): boolean {
  return rotation === 0 || rotation === 180;
}

function segmentsOf(points: Point[]): { a: Point; b: Point }[] {
  const segs: { a: Point; b: Point }[] = [];
  for (let i = 0; i < points.length - 1; i++) segs.push({ a: points[i], b: points[i + 1] });
  return segs;
}

function manhattanLength(segs: { a: Point; b: Point }[]): number {
  return segs.reduce((sum, s) => sum + Math.abs(s.a.x - s.b.x) + Math.abs(s.a.y - s.b.y), 0);
}

/** Counts true mid-segment crossings between two sets of orthogonal segments - one horizontal, one
 * vertical, meeting strictly inside both (a shared endpoint is a junction, not a crossing). */
function crossingCount(segsA: { a: Point; b: Point }[], segsB: { a: Point; b: Point }[]): number {
  let count = 0;
  for (const s1 of segsA) {
    const horizontal1 = s1.a.y === s1.b.y;
    for (const s2 of segsB) {
      const horizontal2 = s2.a.y === s2.b.y;
      if (horizontal1 === horizontal2) continue;
      const h = horizontal1 ? s1 : s2;
      const v = horizontal1 ? s2 : s1;
      const x = v.a.x;
      const y = h.a.y;
      if (x > Math.min(h.a.x, h.b.x) && x < Math.max(h.a.x, h.b.x) && y > Math.min(v.a.y, v.b.y) && y < Math.max(v.a.y, v.b.y)) count++;
    }
  }
  return count;
}

/**
 * Picks, for each unpinned part with a real alternative orientation, whichever rotation/mirror
 * minimizes the Manhattan length and crossing count of the wires touching it - a greedy, deterministic
 * pass over a few rounds (see PASSES), run once at the end of auto-arrange. Pinned parts, fixed parts
 * (whose orientation a layout template already decided) and parts with only one sensible orientation
 * are left untouched; see OrientationConstraints for the series/stack rules.
 */
export function optimizePartOrientations(parts: PartInstance[], wires: Wire[], constraints: OrientationConstraints = {}): PartInstance[] {
  const fixed = constraints.fixed ?? new Set<string>();
  const keepAxis = constraints.keepAxis ?? new Set<string>();
  const preferVertical = constraints.preferVertical ?? new Set<string>();
  const byId = new Map(parts.map((p) => [p.id, p]));
  const wiresByPart = new Map<string, Wire[]>();
  for (const w of wires) {
    for (const partId of [w.a.partId, w.b.partId]) {
      if (!wiresByPart.has(partId)) wiresByPart.set(partId, []);
      wiresByPart.get(partId)!.push(w);
    }
  }

  const candidates = parts.filter((p) => !p.pinned && !fixed.has(p.id) && candidateOrientations(p, keepAxis.has(p.id)).length > 1);
  if (candidates.length === 0) return parts;
  const order = [...candidates].sort((a, b) => a.x - b.x || a.y - b.y || a.id.localeCompare(b.id));

  for (let pass = 0; pass < PASSES; pass++) {
    for (const part of order) {
      const current = byId.get(part.id)!;
      const myWires = wiresByPart.get(part.id) ?? [];
      const otherWireSegs = wires
        .filter((w) => w.a.partId !== part.id && w.b.partId !== part.id)
        .flatMap((w) => segmentsOf(orthogonalPoints(terminalPosition(byId.get(w.a.partId)!, w.a.terminalId), terminalPosition(byId.get(w.b.partId)!, w.b.terminalId))));

      let bestOrientation = orientationOf(current);
      let bestScore = Infinity;
      for (const candidate of candidateOrientations(current, keepAxis.has(part.id))) {
        const trial: PartInstance = { ...current, rotation: candidate.rotation, mirror: candidate.mirror };
        const trialSegs = myWires.flatMap((w) => {
          const mine = w.a.partId === part.id ? w.a : w.b;
          const other = w.a.partId === part.id ? w.b : w.a;
          const otherPos = other.partId === part.id ? terminalPosition(trial, other.terminalId) : terminalPosition(byId.get(other.partId)!, other.terminalId);
          return segmentsOf(orthogonalPoints(terminalPosition(trial, mine.terminalId), otherPos));
        });
        const crossings = crossingCount(trialSegs, otherWireSegs) + crossingCount(trialSegs, trialSegs);
        const stackPenalty = preferVertical.has(part.id) && isHorizontal(candidate.rotation) ? HORIZONTAL_STACK_PENALTY : 0;
        const score = manhattanLength(trialSegs) + crossings * CROSSING_PENALTY + stackPenalty;
        if (score < bestScore - 1e-6) {
          bestScore = score;
          bestOrientation = candidate;
        }
      }

      if (bestOrientation.rotation !== current.rotation || bestOrientation.mirror !== !!current.mirror) {
        byId.set(part.id, { ...current, rotation: bestOrientation.rotation, mirror: bestOrientation.mirror || undefined });
      }
    }
  }

  return parts.map((p) => byId.get(p.id) ?? p);
}
