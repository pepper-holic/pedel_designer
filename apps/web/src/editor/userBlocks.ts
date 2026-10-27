import { bboxOfParts } from "./blockGeometry";
import { snapToGrid } from "./geometry";
import { PART_DEFS, type PartType } from "./partDefs";
import type { CircuitSnapshot } from "./historyStack";
import type { PlacedBlock } from "./blockInstance";
import type { BlockCategory, BlockInstance, BlockParam, BlockPort, PartInstance, TerminalRef, Wire } from "./types";

export const USER_BLOCKS_STORAGE_KEY = "pedal-designer:user-blocks";

/**
 * A block the user saved from their own circuit ("내 블록으로 저장"). Stored at part level - the
 * same shape as a wiring preset - so knobs stay knobs and nothing has to be re-derived from a
 * netlist. Positions are relative to the block's top-left so it can be dropped anywhere.
 */
export interface UserBlock {
  id: string;
  label: string;
  category: BlockCategory;
  description: string;
  parts: PartInstance[];
  /** Only wires with both ends inside the block - connections to the outside are what ports are for. */
  wires: Wire[];
  ports: BlockPort[];
  params: BlockParam[];
  savedAt: string;
}

export function blockToUserBlock(snapshot: CircuitSnapshot, blockId: string, id: string, now = new Date()): UserBlock | null {
  const block = snapshot.blocks.find((b) => b.id === blockId);
  const members = snapshot.parts.filter((p) => p.blockId === blockId);
  const box = bboxOfParts(members);
  if (!block || !box) return null;
  const memberIds = new Set(members.map((p) => p.id));
  return {
    id,
    label: block.label,
    category: block.category,
    description: `내 블록 - 부품 ${members.length}개, 포트 ${block.ports.map((p) => p.label).join("/") || "없음"}`,
    parts: members.map((p) => {
      const copy: PartInstance = { ...p, x: p.x - box.minX, y: p.y - box.minY, params: { ...p.params } };
      delete copy.blockId;
      return copy;
    }),
    wires: snapshot.wires.filter((w) => memberIds.has(w.a.partId) && memberIds.has(w.b.partId)).map((w) => ({ ...w, a: { ...w.a }, b: { ...w.b } })),
    ports: block.ports.map((p) => ({ ...p, terminal: { ...p.terminal } })),
    params: block.params.map((p) => ({ ...p })),
    savedAt: now.toISOString(),
  };
}

/** Drops a saved block onto the canvas, collapsed by default - reusing a block is mostly about the
 * black box, and it can always be opened. */
export function instantiateUserBlock(ub: UserBlock, instanceId: string, position: { x: number; y: number }, collapsed = true): PlacedBlock {
  const prefix = `${instanceId}_`;
  const ref = (r: TerminalRef): TerminalRef => ({ partId: `${prefix}${r.partId}`, terminalId: r.terminalId });
  const block: BlockInstance = {
    id: instanceId,
    defId: `user:${ub.id}`,
    label: ub.label,
    category: ub.category,
    ports: ub.ports.map((p) => ({ ...p, terminal: ref(p.terminal) })),
    params: ub.params.map((p) => ({ ...p, partId: `${prefix}${p.partId}` })),
    collapsed,
  };
  return {
    parts: ub.parts.map((p) => ({ ...p, id: `${prefix}${p.id}`, x: snapToGrid(p.x + position.x), y: snapToGrid(p.y + position.y), params: { ...p.params }, blockId: instanceId })),
    wires: ub.wires.map((w) => ({ id: `${prefix}${w.id}`, a: ref(w.a), b: ref(w.b) })),
    block,
  };
}

/** Defensive read: a hand-edited or older entry with an unknown part type would crash the canvas,
 * so anything that does not look like a usable block is skipped rather than loaded. */
function isUsable(value: unknown): value is UserBlock {
  const ub = value as UserBlock;
  return (
    !!ub &&
    typeof ub.id === "string" &&
    typeof ub.label === "string" &&
    Array.isArray(ub.parts) &&
    Array.isArray(ub.wires) &&
    Array.isArray(ub.ports) &&
    Array.isArray(ub.params) &&
    ub.parts.every((p) => typeof p?.id === "string" && !!PART_DEFS[p.type as PartType])
  );
}

export function loadUserBlocks(storage: Pick<Storage, "getItem">): UserBlock[] {
  try {
    const parsed = JSON.parse(storage.getItem(USER_BLOCKS_STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter(isUsable) : [];
  } catch {
    return [];
  }
}

export function saveUserBlocks(storage: Pick<Storage, "setItem">, blocks: UserBlock[]): void {
  storage.setItem(USER_BLOCKS_STORAGE_KEY, JSON.stringify(blocks));
}
