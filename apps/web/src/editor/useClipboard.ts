import { useRef, useState } from "react";
import { cloneSelection } from "./selection";
import { cloneBlocksForCopies } from "./blockOps";
import { nextFreeId } from "./ids";
import type { CircuitSnapshot } from "./historyStack";
import type { useSelectionState } from "./useSelectionState";

/** Pasted copies land slightly off the originals so they are visibly a second object. */
const PASTE_OFFSET = { dx: 30, dy: 30 };

interface ClipboardOptions {
  present: CircuitSnapshot;
  commit: (next: CircuitSnapshot) => void;
  selection: ReturnType<typeof useSelectionState>;
  onStatus: (message: string) => void;
}

/** Ctrl+C / Ctrl+V / Ctrl+D. Whole blocks in the selection are copied as blocks. */
export function useClipboard({ present, commit, selection, onStatus }: ClipboardOptions) {
  // The clipboard holds the whole canvas as it was at copy time plus the ids that were selected, so
  // a paste still works after the originals have been edited or deleted.
  const [clipboard, setClipboard] = useState<CircuitSnapshot | null>(null);
  const clipboardIds = useRef<string[]>([]);

  const pasteClone = (source: CircuitSnapshot, sourceIds: string[]) => {
    const prefix = nextFreeId("cp", present.parts.map((p) => p.id.split("_")[0]));
    const { parts: copies, wires: newWires } = cloneSelection(source.parts, source.wires, sourceIds, PASTE_OFFSET, prefix);
    if (copies.length === 0) return;
    const copied = new Set(sourceIds);
    const { blocks: newBlocks, blockIdFor } = cloneBlocksForCopies(source.blocks, source.parts, copied, (id) => `${prefix}_${id}`, prefix);
    const newParts = copies.map((p) => {
      const blockId = blockIdFor(p.blockId);
      const copy = { ...p };
      if (blockId) copy.blockId = blockId;
      else delete copy.blockId;
      return copy;
    });
    commit({ parts: [...present.parts, ...newParts], wires: [...present.wires, ...newWires], blocks: [...present.blocks, ...newBlocks] });
    if (newBlocks.length === 1 && newParts.every((p) => p.blockId === newBlocks[0].id)) selection.selectBlock(newBlocks[0].id, newParts.map((p) => p.id));
    else selection.selectParts(newParts.map((p) => p.id));
    onStatus(`${newParts.length}개 부품을 붙여넣었습니다${newBlocks.length > 0 ? ` (블록 ${newBlocks.length}개 포함)` : ""}.`);
  };

  const copy = () => {
    if (selection.selectedPartIds.length === 0) return;
    setClipboard(present);
    clipboardIds.current = selection.selectedPartIds;
    onStatus(`${selection.selectedPartIds.length}개 부품을 복사했습니다.`);
  };

  const paste = () => {
    if (clipboard) pasteClone(clipboard, clipboardIds.current);
  };

  const duplicate = () => pasteClone(present, selection.selectedPartIds);

  return { copy, paste, duplicate };
}
