import { useEffect } from "react";

/** Arrow key to a unit direction, in grid steps. */
const ARROW_DELTAS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

interface EditorShortcuts {
  onUndo: () => void;
  onRedo: () => void;
  onRotate: () => void;
  onDelete: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onDuplicate: () => void;
  /** Arrow-key move, in grid steps. Also what selects a part when nothing is selected yet. */
  onNudge: (dx: number, dy: number) => void;
  /** Bracket keys, +1 or -1, so the canvas is reachable without a mouse. */
  onCycleSelection: (direction: 1 | -1) => void;
  onDeselect: () => void;
  /** Ctrl+G / Ctrl+Shift+G: group the selection into a block / dissolve the selected block. */
  onGroup?: () => void;
  onUngroup?: () => void;
  /** P: toggle probe mode. */
  onToggleProbeMode?: () => void;
  /** False while the canvas is not shown (the player view): only undo/redo stay live, so an arrow
   * key meant for a knob cannot move a part nobody can see. */
  canvasActive?: boolean;
  /** 1-4: switch work step (index 0-3). */
  onMode?: (index: number) => void;
  /** ?: the shortcut help. */
  onHelp?: () => void;
  /** Space: real-time playback on/off. */
  onTogglePlay?: () => void;
}

/**
 * Global keyboard shortcuts for the canvas.
 *
 * Listens on `window` rather than the canvas element because the canvas is an SVG with no focus of
 * its own - a user who has just clicked a part expects Delete to work without hunting for where
 * focus went. Typing in a form control is excluded so "r" in a resistance field stays a letter.
 */
export function useEditorShortcuts({
  onUndo,
  onRedo,
  onRotate,
  onDelete,
  onCopy,
  onPaste,
  onDuplicate,
  onNudge,
  onCycleSelection,
  onDeselect,
  onGroup,
  onUngroup,
  onToggleProbeMode,
  canvasActive = true,
  onMode,
  onHelp,
  onTogglePlay,
}: EditorShortcuts): void {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "SELECT" || target.tagName === "TEXTAREA") return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) onRedo();
        else onUndo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        onRedo();
        return;
      }
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        if (onMode && e.key >= "1" && e.key <= "4") {
          e.preventDefault();
          onMode(Number(e.key) - 1);
          return;
        }
        if (onHelp && e.key === "?") {
          e.preventDefault();
          onHelp();
          return;
        }
        // On a focused button or slider Space is that control's own key.
        if (onTogglePlay && e.key === " " && target.tagName !== "BUTTON" && target.getAttribute?.("role") !== "slider") {
          e.preventDefault();
          onTogglePlay();
          return;
        }
      }
      if (!canvasActive) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "g") {
        e.preventDefault();
        if (e.shiftKey) onUngroup?.();
        else onGroup?.();
        return;
      }
      if (e.ctrlKey || e.metaKey) {
        const key = e.key.toLowerCase();
        if (key === "c" || key === "v" || key === "d") {
          e.preventDefault();
          if (key === "c") onCopy();
          else if (key === "v") onPaste();
          else onDuplicate();
          return;
        }
      }
      // Holding shift covers ground fast; a single step is for lining parts up exactly.
      const step = e.shiftKey ? 10 : 1;
      if (ARROW_DELTAS[e.key]) {
        e.preventDefault();
        const [dx, dy] = ARROW_DELTAS[e.key];
        onNudge(dx * step, dy * step);
        return;
      }
      if (e.key === "]" || e.key === "[") {
        e.preventDefault();
        onCycleSelection(e.key === "]" ? 1 : -1);
        return;
      }
      if (e.key === "Escape") {
        onDeselect();
        return;
      }
      if (e.key === "r" || e.key === "R") onRotate();
      if ((e.key === "p" || e.key === "P") && onToggleProbeMode) onToggleProbeMode();
      if (e.key === "Delete" || e.key === "Backspace") onDelete();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    onUndo,
    onRedo,
    onRotate,
    onDelete,
    onCopy,
    onPaste,
    onDuplicate,
    onNudge,
    onCycleSelection,
    onDeselect,
    onGroup,
    onUngroup,
    onToggleProbeMode,
    canvasActive,
    onMode,
    onHelp,
    onTogglePlay,
  ]);
}
