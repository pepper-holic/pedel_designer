import { useCallback, useEffect, useRef, useState } from "react";
import { fitView, zoomAroundPoint, type ContentBounds } from "./geometry";

export const MIN_ZOOM = 0.3;
export const MAX_ZOOM = 3;

/**
 * Pan/zoom state of the schematic canvas: wheel zoom around the cursor, +/- buttons, reset, and
 * fit-to-content (re-run whenever `fitSignal` changes - a replaced circuit, a placed block).
 *
 * `bounds` is what fit should frame; it is read through a ref so a drag (which changes it every
 * frame) does not re-fit the view under the user's hand.
 */
export function useCanvasView(svgRef: React.RefObject<SVGSVGElement | null>, bounds: ContentBounds[], size: { width: number; height: number }, fitSignal: number) {
  const [view, setView] = useState({ zoom: 1, panX: 0, panY: 0 });

  // Attached as a native (non-passive) listener rather than React's onWheel: React registers
  // wheel handlers as passive, which silently drops preventDefault() and lets the page scroll
  // underneath the zoom gesture instead of stopping it.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheelNative = (e: WheelEvent) => {
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      const p = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      setView((v) => zoomAroundPoint(v, p, factor, MIN_ZOOM, MAX_ZOOM));
    };
    svg.addEventListener("wheel", onWheelNative, { passive: false });
    return () => svg.removeEventListener("wheel", onWheelNative);
  }, [svgRef]);

  const boundsRef = useRef(bounds);
  useEffect(() => {
    boundsRef.current = bounds;
  }, [bounds]);

  const { width, height } = size;
  const fit = useCallback(() => setView(fitView(boundsRef.current, { width, height }, { minZoom: MIN_ZOOM })), [width, height]);
  useEffect(() => {
    fit();
  }, [fitSignal, fit]);

  return {
    view,
    setView,
    fit,
    reset: () => setView({ zoom: 1, panX: 0, panY: 0 }),
    zoomIn: () => setView((v) => ({ ...v, zoom: Math.min(MAX_ZOOM, v.zoom * 1.2) })),
    zoomOut: () => setView((v) => ({ ...v, zoom: Math.max(MIN_ZOOM, v.zoom / 1.2) })),
    /** Screen point (relative to the SVG) to world coordinates. */
    toWorld: (screen: { x: number; y: number }) => ({ x: (screen.x - view.panX) / view.zoom, y: (screen.y - view.panY) / view.zoom }),
  };
}
