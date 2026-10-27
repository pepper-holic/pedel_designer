import { useEffect, useRef, useState } from "react";

/** Used where the box cannot be measured (tests, no ResizeObserver). */
const FALLBACK = { width: 800, height: 260 };

/**
 * The CSS size a plot actually gets, kept current as its box resizes - so a plot is drawn for the
 * space it is shown in instead of being drawn at a fixed size and stretched (which made the dock's
 * plots taller than the dock and scaled their lettering with the window width).
 * `fixed` pins either dimension.
 */
export function usePlotSize<T extends HTMLElement>(fixed: { width?: number; height?: number } = {}) {
  const ref = useRef<T>(null);
  const [measured, setMeasured] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setMeasured((prev) => (prev && Math.abs(prev.width - width) < 0.5 && Math.abs(prev.height - height) < 0.5 ? prev : { width, height }));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const width = Math.max(1, Math.floor(fixed.width ?? (measured?.width || FALLBACK.width)));
  const height = Math.max(1, Math.floor(fixed.height ?? (measured?.height || FALLBACK.height)));
  return { ref, width, height };
}

/**
 * Sizes a canvas's backing store to `width`×`height` CSS pixels at the screen's pixel density, and
 * returns a context that draws in CSS pixels - crisp lines and text at any zoom.
 */
export function prepareCanvas(canvas: HTMLCanvasElement, width: number, height: number): CanvasRenderingContext2D | null {
  const dpr = typeof window !== "undefined" && window.devicePixelRatio ? window.devicePixelRatio : 1;
  const w = Math.round(width * dpr);
  const h = Math.round(height * dpr);
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  return ctx;
}

/** Where the data goes inside a plot, leaving room for the axis labels. */
export interface PlotArea {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export const AXIS_FONT = "11px 'JetBrains Mono', monospace";
export const GRID_COLOR = "#e3e7d3";
export const LABEL_COLOR = "#6f735a";

export function plotArea(width: number, height: number): PlotArea {
  return { left: 46, top: 8, right: width - 10, bottom: height - 20 };
}

/** A grid step (in the axis's units) that keeps labels at least `minPx` apart. */
export function niceStep(range: number, pixels: number, base: number, minPx = 18): number {
  let step = base;
  while ((pixels / range) * step < minPx) step *= 2;
  return step;
}

/** Log-frequency x axis and dB y axis with gridlines and labels outside the data area. */
export function drawLogDbAxes(
  ctx: CanvasRenderingContext2D,
  area: PlotArea,
  opts: { fMin: number; fMax: number; minDb: number; maxDb: number; freqLabels: number[] },
) {
  const { fMin, fMax, minDb, maxDb, freqLabels } = opts;
  const xOf = (f: number) => area.left + ((Math.log10(f) - Math.log10(fMin)) / (Math.log10(fMax) - Math.log10(fMin))) * (area.right - area.left);
  const yOf = (db: number) => area.bottom - ((db - minDb) / (maxDb - minDb)) * (area.bottom - area.top);
  ctx.font = AXIS_FONT;
  ctx.lineWidth = 1;
  ctx.strokeStyle = GRID_COLOR;
  ctx.fillStyle = LABEL_COLOR;
  const step = niceStep(maxDb - minDb, area.bottom - area.top, 10);
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let db = Math.ceil(minDb / step) * step; db <= maxDb; db += step) {
    const y = Math.round(yOf(db)) + 0.5;
    ctx.beginPath();
    ctx.moveTo(area.left, y);
    ctx.lineTo(area.right, y);
    ctx.stroke();
    ctx.fillText(`${db}dB`, area.left - 5, y);
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  let lastLabelX = -Infinity;
  for (const f of freqLabels) {
    if (f < fMin || f > fMax) continue;
    const x = Math.round(xOf(f)) + 0.5;
    ctx.beginPath();
    ctx.moveTo(x, area.top);
    ctx.lineTo(x, area.bottom);
    ctx.stroke();
    // Skip a label that would run into the previous one on a narrow plot.
    if (x - lastLabelX < 34) continue;
    ctx.fillText(f >= 1000 ? `${f / 1000}k` : `${f}`, x, area.bottom + 4);
    lastLabelX = x;
  }
  ctx.strokeStyle = "#c9ceb6";
  ctx.strokeRect(area.left + 0.5, area.top + 0.5, area.right - area.left, area.bottom - area.top);
  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
  return { xOf, yOf };
}
