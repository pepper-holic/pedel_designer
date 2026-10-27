import { useRef } from "react";
import { snapToGrid } from "./geometry";
import { movePartsBy } from "./circuitEdits";
import { commitPrevious, replacePresent, type CircuitSnapshot, type HistoryState } from "./historyStack";

interface DragEditingOptions {
  history: HistoryState;
  setHistory: React.Dispatch<React.SetStateAction<HistoryState>>;
  selectedPartIds: string[];
}

/**
 * Continuous edits - dragging parts and dragging wire segments. Every mouse move replaces the
 * present snapshot without an undo step; the drag's starting snapshot is committed once at the end,
 * so a whole drag is one undo.
 *
 * Parts the user drags by hand become `pinned`: they were put there on purpose, and "자동 정렬"
 * should leave them alone.
 */
export function useDragEditing({ history, setHistory, selectedPartIds }: DragEditingOptions) {
  const dragStart = useRef<CircuitSnapshot | null>(null);

  const begin = () => {
    if (dragStart.current === null) dragStart.current = history.present;
  };

  const movePart = (id: string, x: number, y: number) => {
    begin();
    const parts = history.present.parts;
    const dragged = parts.find((p) => p.id === id);
    if (!dragged) return;
    // Dragging one part of a multi-selection moves the whole selection - leaving the others behind
    // is the thing that makes box-select feel broken.
    const moving = selectedPartIds.includes(id) ? new Set(selectedPartIds) : new Set([id]);
    setHistory((h) => replacePresent(h, movePartsBy(history.present, moving, snapToGrid(x) - dragged.x, snapToGrid(y) - dragged.y)));
  };

  const setWireWaypoints = (wireId: string, waypoints: { x: number; y: number }[]) => {
    begin();
    setHistory((h) => replacePresent(h, { ...h.present, wires: h.present.wires.map((w) => (w.id === wireId ? { ...w, waypoints } : w)) }));
  };

  const end = () => {
    const before = dragStart.current;
    dragStart.current = null;
    if (!before) return;
    setHistory((h) => {
      const start = new Map(before.parts.map((p) => [p.id, p]));
      const parts = h.present.parts.map((p) => {
        const was = start.get(p.id);
        return was && (was.x !== p.x || was.y !== p.y) && !p.pinned ? { ...p, pinned: true } : p;
      });
      return commitPrevious(replacePresent(h, { ...h.present, parts }), before);
    });
  };

  return { movePart, setWireWaypoints, end };
}
