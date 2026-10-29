import { useCallback, useEffect, useState } from "react";

export type DockSide = "left" | "right";

/** Where the design step's two side columns sit and how wide they are - the user's own arrangement. */
export interface WorkspaceLayout {
  /** The library's side; the inspector takes the other one. */
  librarySide: DockSide;
  libraryWidth: number;
  inspectorWidth: number;
  libraryCollapsed: boolean;
  inspectorCollapsed: boolean;
}

export const STORAGE_KEY = "pedal-designer:workspace-layout";

export const DEFAULT_LAYOUT: WorkspaceLayout = {
  librarySide: "left",
  libraryWidth: 272,
  inspectorWidth: 300,
  libraryCollapsed: false,
  inspectorCollapsed: false,
};

export const LIMITS = {
  library: { min: 220, max: 520 },
  inspector: { min: 240, max: 520 },
  /** The schematic always keeps at least this much width between the two columns. */
  centerMin: 420,
} as const;

/** The strip a collapsed column keeps - wide enough for its reopen control and a vertical title. */
export const RAIL_WIDTH = 34;
/** Grid gap plus one resize handle, per side column. */
export const COLUMN_GUTTER = 12;

export function clampLayout(layout: WorkspaceLayout, viewportWidth: number): WorkspaceLayout {
  const library = Math.round(Math.min(LIMITS.library.max, Math.max(LIMITS.library.min, layout.libraryWidth)));
  const inspector = Math.round(Math.min(LIMITS.inspector.max, Math.max(LIMITS.inspector.min, layout.inspectorWidth)));
  // What the two open columns may take together, leaving the centre its minimum.
  const budget = viewportWidth - LIMITS.centerMin - 2 * COLUMN_GUTTER - 24;
  const libraryTaken = layout.libraryCollapsed ? RAIL_WIDTH : library;
  const inspectorTaken = layout.inspectorCollapsed ? RAIL_WIDTH : inspector;
  let libraryWidth = library;
  let inspectorWidth = inspector;
  if (libraryTaken + inspectorTaken > budget) {
    // Shrink the open columns toward their minimums, the wider one first.
    const over = libraryTaken + inspectorTaken - budget;
    if (!layout.libraryCollapsed && (layout.inspectorCollapsed || library >= inspector)) libraryWidth = Math.max(LIMITS.library.min, library - over);
    else if (!layout.inspectorCollapsed) inspectorWidth = Math.max(LIMITS.inspector.min, inspector - over);
  }
  return { ...layout, libraryWidth, inspectorWidth };
}

function readLayout(): WorkspaceLayout {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_LAYOUT;
    const parsed = JSON.parse(raw) as Partial<WorkspaceLayout>;
    return {
      librarySide: parsed.librarySide === "right" ? "right" : "left",
      libraryWidth: typeof parsed.libraryWidth === "number" ? parsed.libraryWidth : DEFAULT_LAYOUT.libraryWidth,
      inspectorWidth: typeof parsed.inspectorWidth === "number" ? parsed.inspectorWidth : DEFAULT_LAYOUT.inspectorWidth,
      libraryCollapsed: !!parsed.libraryCollapsed,
      inspectorCollapsed: !!parsed.inspectorCollapsed,
    };
  } catch {
    return DEFAULT_LAYOUT;
  }
}

function viewportWidth(): number {
  return typeof window === "undefined" ? 1440 : window.innerWidth;
}

/**
 * The design workspace's arrangement, remembered across sessions: which side the library is on,
 * how wide each side column is, and whether either is folded to its rail. Widths are clamped to
 * the window so the schematic never loses its minimum width when the window shrinks.
 */
export function useWorkspaceLayout() {
  const [layout, setLayoutState] = useState<WorkspaceLayout>(() => clampLayout(readLayout(), viewportWidth()));

  const setLayout = useCallback((update: (prev: WorkspaceLayout) => WorkspaceLayout) => {
    setLayoutState((prev) => {
      const next = clampLayout(update(prev), viewportWidth());
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // the arrangement still applies for this session
      }
      return next;
    });
  }, []);

  useEffect(() => {
    const onResize = () => setLayoutState((prev) => clampLayout(prev, viewportWidth()));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return {
    layout,
    setLibraryWidth: (w: number) => setLayout((p) => ({ ...p, libraryWidth: w })),
    setInspectorWidth: (w: number) => setLayout((p) => ({ ...p, inspectorWidth: w })),
    swapSides: () => setLayout((p) => ({ ...p, librarySide: p.librarySide === "left" ? "right" : "left" })),
    setLibraryCollapsed: (c: boolean) => setLayout((p) => ({ ...p, libraryCollapsed: c })),
    setInspectorCollapsed: (c: boolean) => setLayout((p) => ({ ...p, inspectorCollapsed: c })),
    resetWidths: () => setLayout((p) => ({ ...p, libraryWidth: DEFAULT_LAYOUT.libraryWidth, inspectorWidth: DEFAULT_LAYOUT.inspectorWidth })),
  };
}
