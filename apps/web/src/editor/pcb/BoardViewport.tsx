import { useEffect, useRef, useState } from "react";
import { ShapeSvg } from "./ShapeSvg";
import type { Shape } from "./stripboardDrawing";
import type { Hole } from "./stripboardTypes";
import { Icon } from "../../ui/Icon";

interface BoardViewportProps {
  shapes: Shape[];
  /** Drawing size in its own units. */
  width: number;
  height: number;
  label: string;
  onHoleClick?: (hole: Hole) => void;
  onDrag?: (ref: string, dx: number, dy: number) => void;
  onDragEnd?: (ref: string, dx: number, dy: number) => void;
  /** 1 = fitted; set from a `ZoomControls` the panel puts in its own button row. */
  zoom: number;
}

const ZOOM_STEP = 1.25;
/** Height the fitted view may take when there is no dock to measure. */
const FALLBACK_HEIGHT = 360;
/** Breathing room below the drawing when fitting it inside the dock. */
const DOCK_GAP = 14;

/**
 * A board drawing with "fit" and zoom: fitted, the whole board shows at once inside the space the
 * dock gives it (it used to be drawn at a fixed scale and cut off by the dock); zoomed in, it
 * scrolls.
 */
export function BoardViewport({ shapes, width, height, label, onHoleClick, onDrag, onDragEnd, zoom }: BoardViewportProps) {
  const frame = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ width: 640, height: FALLBACK_HEIGHT });

  useEffect(() => {
    const el = frame.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const dock = el.closest<HTMLElement>("[data-fit-container]");
    const measure = () => {
      // Fitted, the drawing ends at the dock's bottom edge when the dock is scrolled to the top -
      // everything above it in the panel (title, buttons, status) is measured, not guessed.
      let available = FALLBACK_HEIGHT;
      if (dock) {
        const offset = el.getBoundingClientRect().top - dock.getBoundingClientRect().top + dock.scrollTop;
        available = Math.max(160, dock.clientHeight - offset - DOCK_GAP);
      }
      setBox((prev) => (prev.width === el.clientWidth && prev.height === available ? prev : { width: el.clientWidth || prev.width, height: available }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    if (dock) observer.observe(dock);
    return () => observer.disconnect();
  }, []);

  const fit = Math.max(0.5, Math.min(box.width / width, box.height / height));
  const scale = fit * zoom;

  return (
    <div className="board-viewport">
      <div ref={frame} className="board-frame" style={{ maxHeight: zoom === 1 ? undefined : box.height + 24 }}>
        <ShapeSvg shapes={shapes} width={width} height={height} scale={scale} label={label} onHoleClick={onHoleClick} onDrag={onDrag} onDragEnd={onDragEnd} />
      </div>
    </div>
  );
}

/** Zoom buttons for a `BoardViewport`, to sit at the end of the panel's own button row. */
export function ZoomControls({ zoom, onZoom, label }: { zoom: number; onZoom: (zoom: number) => void; label: string }) {
  return (
    <div className="board-zoom" role="group" aria-label={`${label} 확대/축소`}>
      <button type="button" onClick={() => onZoom(zoom / ZOOM_STEP)} aria-label="축소" disabled={zoom <= 0.5}>
        <Icon name="minus" />
      </button>
      <button type="button" onClick={() => onZoom(1)} aria-pressed={zoom === 1} title="보드 전체가 보이게">
        맞춤
      </button>
      <button type="button" onClick={() => onZoom(zoom * ZOOM_STEP)} aria-label="확대" disabled={zoom >= 8}>
        <Icon name="plus" />
      </button>
      <span className="board-zoom-value">{Math.round(zoom * 100)}%</span>
    </div>
  );
}
