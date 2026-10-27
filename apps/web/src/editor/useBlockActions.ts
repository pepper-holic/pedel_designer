import { useState } from "react";
import { groupParts, setBlockCollapsed, ungroupBlock, updateBlock, membersOf } from "./blockOps";
import { updatePartParams } from "./circuitEdits";
import { instantiateBlock, type PlacedBlock } from "./blockInstance";
import { blockToUserBlock, instantiateUserBlock, loadUserBlocks, saveUserBlocks, type UserBlock } from "./userBlocks";
import { nextFreeId } from "./ids";
import type { BlockDef } from "./blocks";
import type { CircuitSnapshot } from "./historyStack";
import type { BlockParam, BlockPort } from "./types";
import type { useSelectionState } from "./useSelectionState";

interface BlockActionsOptions {
  present: CircuitSnapshot;
  commit: (next: CircuitSnapshot) => void;
  selection: ReturnType<typeof useSelectionState>;
  onStatus: (message: string) => void;
  /** Called after a knob turned on a block, so the change can be heard. */
  onKnobChanged: () => void;
}

function readUserBlocks(): UserBlock[] {
  try {
    return loadUserBlocks(localStorage);
  } catch {
    return [];
  }
}

/** Signal chains read left to right; past this width new blocks start a new row instead. */
const ROW_WIDTH = 1600;

/** Where a new block lands: right of everything on the canvas (the next stage in the chain), or at
 * the start of a new row underneath once the row is full - never on top of existing parts. */
function dropPosition(snapshot: CircuitSnapshot): { x: number; y: number } {
  if (snapshot.parts.length === 0) return { x: 100, y: 100 };
  const maxX = Math.max(...snapshot.parts.map((p) => p.x));
  const maxY = Math.max(...snapshot.parts.map((p) => p.y));
  const minY = Math.min(...snapshot.parts.map((p) => p.y));
  return maxX + 200 < ROW_WIDTH ? { x: maxX + 200, y: Math.max(100, minY) } : { x: 100, y: maxY + 260 };
}

/** Everything the editor does to blocks: add from the library, group/ungroup, collapse, edit ports
 * and knobs, and the "내 블록" library of saved blocks. */
export function useBlockActions({ present, commit, selection, onStatus, onKnobChanged }: BlockActionsOptions) {
  const [userBlocks, setUserBlocks] = useState<UserBlock[]>(readUserBlocks);
  // Bumped whenever a block is dropped in, so the canvas re-fits and the new block is in view.
  const [placedCount, setPlacedCount] = useState(0);

  const persistUserBlocks = (next: UserBlock[]) => {
    setUserBlocks(next);
    try {
      saveUserBlocks(localStorage, next);
    } catch {
      onStatus("브라우저 저장소에 쓸 수 없어 이번 세션에서만 유지됩니다.");
    }
  };

  const newBlockId = () => nextFreeId("blk", present.blocks.map((b) => b.id));

  const place = (placed: PlacedBlock, label: string) => {
    commit({ parts: [...present.parts, ...placed.parts], wires: [...present.wires, ...placed.wires], blocks: [...present.blocks, placed.block] });
    selection.selectBlock(placed.block.id, placed.parts.map((p) => p.id));
    setPlacedCount((n) => n + 1);
    onStatus(`블록 추가: ${label}`);
  };

  const addLibraryBlock = (def: BlockDef) => place(instantiateBlock(def, newBlockId(), dropPosition(present)), def.label);
  const addUserBlock = (ub: UserBlock) => place(instantiateUserBlock(ub, newBlockId(), dropPosition(present)), ub.label);

  const toggleCollapse = (blockId: string) => {
    const block = present.blocks.find((b) => b.id === blockId);
    if (!block) return;
    commit(setBlockCollapsed(present, blockId, !block.collapsed));
    selection.selectBlock(blockId);
  };

  const groupSelection = () => {
    const ids = selection.selectedPartIds;
    if (ids.length === 0) {
      onStatus("묶을 부품을 먼저 선택하세요 (Shift+드래그로 여러 개 선택).");
      return;
    }
    const id = newBlockId();
    const next = groupParts(present, ids, { id, label: `블록 ${id.slice(3)}` });
    commit(next);
    selection.selectBlock(id, next.parts.filter((p) => p.blockId === id).map((p) => p.id));
    const block = next.blocks.find((b) => b.id === id)!;
    onStatus(`블록으로 묶었습니다: 부품 ${ids.length}개, 포트 ${block.ports.length}개. 오른쪽에서 이름과 포트를 정리하세요.`);
  };

  /** The block the user means: the selected block, or the block of the selected part. */
  const currentBlockId = () => selection.selectedBlockId ?? present.parts.find((p) => p.id === selection.selectedPartId)?.blockId ?? null;

  const ungroup = (blockId = currentBlockId()) => {
    if (!blockId) return;
    const members = membersOf(present.parts, blockId).map((p) => p.id);
    commit(ungroupBlock(present, blockId));
    selection.selectParts(members);
    onStatus("블록을 해제했습니다. 부품과 배선은 그대로입니다.");
  };

  const rename = (blockId: string, label: string) => commit(updateBlock(present, blockId, { label }));

  const updatePort = (blockId: string, portId: string, patch: Partial<Pick<BlockPort, "label" | "kind">>) => {
    const block = present.blocks.find((b) => b.id === blockId);
    if (block) commit(updateBlock(present, blockId, { ports: block.ports.map((p) => (p.id === portId ? { ...p, ...patch } : p)) }));
  };

  const exposeParam = (blockId: string, partId: string, paramKey: string) => {
    const block = present.blocks.find((b) => b.id === blockId);
    if (!block || block.params.some((p) => p.partId === partId && p.paramKey === paramKey)) return;
    const param: BlockParam = { id: `${partId}.${paramKey}`, label: partId, partId, paramKey };
    commit(updateBlock(present, blockId, { params: [...block.params, param] }));
  };

  const updateParam = (blockId: string, paramId: string, patch: Partial<Pick<BlockParam, "label">> | null) => {
    const block = present.blocks.find((b) => b.id === blockId);
    if (!block) return;
    const params = patch === null ? block.params.filter((p) => p.id !== paramId) : block.params.map((p) => (p.id === paramId ? { ...p, ...patch } : p));
    commit(updateBlock(present, blockId, { params }));
  };

  /** Turning a block's knob edits the part inside it - the block itself holds no values. */
  const setKnob = (param: BlockParam, value: number | string) => {
    commit(updatePartParams(present, param.partId, { [param.paramKey]: value }));
    onKnobChanged();
  };

  const saveAsUserBlock = (blockId: string) => {
    const ub = blockToUserBlock(present, blockId, nextFreeId("ub", userBlocks.map((b) => b.id)));
    if (!ub) return;
    persistUserBlocks([...userBlocks, ub]);
    onStatus(`"${ub.label}"을(를) 내 블록에 저장했습니다. 템플릿/블록 탭의 "내 블록"에서 다시 쓸 수 있습니다.`);
  };

  const deleteUserBlock = (id: string) => persistUserBlocks(userBlocks.filter((b) => b.id !== id));

  return {
    placedCount,
    userBlocks,
    addLibraryBlock,
    addUserBlock,
    deleteUserBlock,
    toggleCollapse,
    groupSelection,
    ungroup,
    rename,
    updatePort,
    exposeParam,
    updateParam,
    setKnob,
    saveAsUserBlock,
  };
}
