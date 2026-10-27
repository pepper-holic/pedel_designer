import { rotateClockwise } from "./geometry";
import { PARAM_META } from "./paramMeta";
import type { CircuitSnapshot } from "./historyStack";

/**
 * Pure snapshot -> snapshot edits behind the editor's commands. Kept out of the component so each
 * one can be tested without rendering, and so the block system (which needs the same deletes and
 * moves applied to a whole group) builds on the same functions.
 */

export function movePartsBy(snapshot: CircuitSnapshot, ids: Iterable<string>, dx: number, dy: number): CircuitSnapshot {
  const moving = new Set(ids);
  return { ...snapshot, parts: snapshot.parts.map((p) => (moving.has(p.id) ? { ...p, x: p.x + dx, y: p.y + dy } : p)) };
}

/** Removes parts, every wire touching them, and any block left with no parts. */
export function deleteParts(snapshot: CircuitSnapshot, ids: Iterable<string>): CircuitSnapshot {
  const removing = new Set(ids);
  const parts = snapshot.parts.filter((p) => !removing.has(p.id));
  const remainingBlockIds = new Set(parts.map((p) => p.blockId).filter((id): id is string => id !== undefined));
  return {
    parts,
    wires: snapshot.wires.filter((w) => !removing.has(w.a.partId) && !removing.has(w.b.partId)),
    blocks: snapshot.blocks.filter((b) => remainingBlockIds.has(b.id)),
  };
}

export function deleteWire(snapshot: CircuitSnapshot, wireId: string): CircuitSnapshot {
  return { ...snapshot, wires: snapshot.wires.filter((w) => w.id !== wireId) };
}

/** Deletes a block and everything in it - including wires from outside into the block, which would
 * otherwise be left pointing at parts that no longer exist. */
export function deleteBlock(snapshot: CircuitSnapshot, blockId: string): CircuitSnapshot {
  const next = deleteParts(
    snapshot,
    snapshot.parts.filter((p) => p.blockId === blockId).map((p) => p.id),
  );
  return { ...next, blocks: next.blocks.filter((b) => b.id !== blockId) };
}

export function rotatePart(snapshot: CircuitSnapshot, id: string): CircuitSnapshot {
  return { ...snapshot, parts: snapshot.parts.map((p) => (p.id === id ? { ...p, rotation: rotateClockwise(p.rotation) } : p)) };
}

export function updatePartParams(snapshot: CircuitSnapshot, id: string, patch: Record<string, number | string>): CircuitSnapshot {
  return { ...snapshot, parts: snapshot.parts.map((p) => (p.id === id ? { ...p, params: { ...p.params, ...patch } } : p)) };
}

/** An inspector field's text as the value to store: a number (clamped to the parameter's minimum)
 * when it parses as one, otherwise the raw string (model names, tapers). */
export function coerceParamValue(key: string, value: string): number | string {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || value.trim() === "") return value;
  const meta = PARAM_META[key];
  return meta?.min !== undefined ? Math.max(parsed, meta.min) : parsed;
}
