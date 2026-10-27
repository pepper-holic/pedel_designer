import { useState } from "react";
import type { PartInstance } from "./types";

/**
 * The editor's selection. Parts and wires share one logical selection - selecting either clears the
 * other, so Delete and the inspector always act on exactly one kind of thing.
 *
 * `selectedPartId` is the one part the inspector shows; `selectedPartIds` is the whole selection
 * that move/copy/delete act on, so a box selection can cover many parts without the inspector
 * having to grow a multi-part mode.
 */
export function useSelectionState(parts: PartInstance[]) {
  const [selectedPartId, setSelectedPartId] = useState<string | null>(null);
  const [selectedWireId, setSelectedWireId] = useState<string | null>(null);
  const [selectedPartIds, setSelectedPartIds] = useState<string[]>([]);
  // A selected block: its parts are the selection (so move/copy/delete act on all of them), and the
  // inspector shows the block rather than whichever member happens to be first.
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);

  const selectPart = (id: string | null) => {
    setSelectedBlockId(null);
    setSelectedPartId(id);
    setSelectedPartIds(id ? [id] : []);
    setSelectedWireId(null);
  };

  const selectParts = (ids: string[]) => {
    setSelectedBlockId(null);
    setSelectedPartIds(ids);
    setSelectedPartId(ids[0] ?? null);
    setSelectedWireId(null);
  };

  const selectWire = (id: string | null) => {
    setSelectedBlockId(null);
    setSelectedWireId(id);
    setSelectedPartId(null);
    setSelectedPartIds([]);
  };

  /** `memberIds` is for a block created in this same event - `parts` here is still the previous
   * render's, so it does not know the new block's members yet. */
  const selectBlock = (blockId: string, memberIds?: string[]) => {
    const ids = memberIds ?? parts.filter((p) => p.blockId === blockId).map((p) => p.id);
    setSelectedBlockId(blockId);
    setSelectedPartIds(ids);
    setSelectedPartId(null);
    setSelectedWireId(null);
  };

  const deselect = () => {
    setSelectedBlockId(null);
    setSelectedPartId(null);
    setSelectedPartIds([]);
    setSelectedWireId(null);
  };

  /** `[`/`]` keys. Wraps, so the list is a loop rather than something you can fall off either end of. */
  const cycle = (direction: 1 | -1) => {
    if (parts.length === 0) return;
    const current = parts.findIndex((p) => p.id === selectedPartId);
    const next = (current + direction + parts.length) % parts.length;
    selectPart(parts[current === -1 ? 0 : next].id);
  };

  return { selectedPartId, selectedPartIds, selectedWireId, selectedBlockId, selectPart, selectParts, selectWire, selectBlock, deselect, cycle };
}
