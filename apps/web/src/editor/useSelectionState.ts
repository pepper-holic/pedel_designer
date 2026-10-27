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

  const selectPart = (id: string | null) => {
    setSelectedPartId(id);
    setSelectedPartIds(id ? [id] : []);
    setSelectedWireId(null);
  };

  const selectParts = (ids: string[]) => {
    setSelectedPartIds(ids);
    setSelectedPartId(ids[0] ?? null);
    setSelectedWireId(null);
  };

  const selectWire = (id: string | null) => {
    setSelectedWireId(id);
    setSelectedPartId(null);
    setSelectedPartIds([]);
  };

  const deselect = () => {
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

  return { selectedPartId, selectedPartIds, selectedWireId, selectPart, selectParts, selectWire, deselect, cycle };
}
