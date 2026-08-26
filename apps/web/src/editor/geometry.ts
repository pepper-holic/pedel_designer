import { PART_DEFS } from "./partDefs";
import type { PartInstance, Rotation } from "./types";

export const GRID_SIZE = 10;

export function snapToGrid(value: number): number {
  return Math.round(value / GRID_SIZE) * GRID_SIZE;
}

export function rotateClockwise(rotation: Rotation): Rotation {
  return ((rotation + 90) % 360) as Rotation;
}

/** Rotates a local offset (dx, dy) by `degrees` clockwise around the origin. */
export function rotateOffset(dx: number, dy: number, degrees: number): { x: number; y: number } {
  const rad = (degrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return { x: dx * cos - dy * sin, y: dx * sin + dy * cos };
}

/** World-space position of a part's terminal, accounting for its rotation. */
export function terminalPosition(part: PartInstance, terminalId: string): { x: number; y: number } {
  const terminal = PART_DEFS[part.type].terminals.find((t) => t.id === terminalId)!;
  const rotated = rotateOffset(terminal.dx, terminal.dy, part.rotation);
  return { x: part.x + rotated.x, y: part.y + rotated.y };
}

/**
 * A 2-bend orthogonal (Manhattan) path between two points, picking
 * horizontal-first or vertical-first based on which axis has more distance
 * to cover - a simple heuristic, not an obstacle-avoiding auto-router.
 */
export function orthogonalPath(a: { x: number; y: number }, b: { x: number; y: number }): string {
  const dx = Math.abs(b.x - a.x);
  const dy = Math.abs(b.y - a.y);
  if (dx > dy) {
    const midX = (a.x + b.x) / 2;
    return `M${a.x},${a.y} L${midX},${a.y} L${midX},${b.y} L${b.x},${b.y}`;
  }
  const midY = (a.y + b.y) / 2;
  return `M${a.x},${a.y} L${a.x},${midY} L${b.x},${midY} L${b.x},${b.y}`;
}
