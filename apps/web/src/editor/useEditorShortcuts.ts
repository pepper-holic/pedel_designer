import { useEffect } from "react";

interface EditorShortcuts {
  onUndo: () => void;
  onRedo: () => void;
  onRotate: () => void;
  onDelete: () => void;
}

/**
 * Global keyboard shortcuts for the canvas.
 *
 * Listens on `window` rather than the canvas element because the canvas is an SVG with no focus of
 * its own - a user who has just clicked a part expects Delete to work without hunting for where
 * focus went. Typing in a form control is excluded so "r" in a resistance field stays a letter.
 */
export function useEditorShortcuts({ onUndo, onRedo, onRotate, onDelete }: EditorShortcuts): void {
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
      if (e.key === "r" || e.key === "R") onRotate();
      if (e.key === "Delete" || e.key === "Backspace") onDelete();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onUndo, onRedo, onRotate, onDelete]);
}
