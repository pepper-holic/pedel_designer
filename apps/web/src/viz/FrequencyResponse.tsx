import { useEffect, useRef } from "react";
import type { AcPoint } from "../core/solver/ac";
import { drawLogDbAxes, plotArea, prepareCanvas, usePlotSize } from "./usePlotSize";

export interface ResponseSeries {
  label: string;
  points: AcPoint[];
  color: string;
}

interface FrequencyResponseProps {
  points: AcPoint[];
  /** Draw several curves on one set of axes instead of the single `points` line - used by the
   * parameter sweep, where the whole point is seeing the knob's positions side by side. */
  series?: ResponseSeries[];
  /** Pin the plot's CSS size; by default it fills its box. */
  width?: number;
  height?: number;
  minDb?: number;
  maxDb?: number;
  /** Optional Monte Carlo tolerance band - same length/frequency alignment as `points`. */
  band?: { minDb: number[]; maxDb: number[] };
}

const LABEL_FREQS = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];

/**
 * Bode magnitude plot: log-scaled frequency axis, linear dB axis. Fills its box (see `.plot-box`)
 * unless `width`/`height` pin it.
 */
export function FrequencyResponse({ points, series, width: fixedWidth, height: fixedHeight, minDb: minDbProp, maxDb: maxDbProp, band }: FrequencyResponseProps) {
  // The range follows the curves in 10dB steps, always keeping 0dB (unity gain) in view and at
  // least 40dB of span - a fixed -60..+20dB put a high-gain drive (~+34dB) off the top and left a
  // flat boost squashed against one edge.
  let dataMax = -Infinity;
  let dataMin = Infinity;
  for (const curve of series ?? [{ points }]) {
    for (const p of curve.points) {
      if (!Number.isFinite(p.magnitudeDb)) continue;
      dataMax = Math.max(dataMax, p.magnitudeDb);
      dataMin = Math.max(-140, Math.min(dataMin, p.magnitudeDb));
    }
  }
  const maxDb = maxDbProp ?? Math.max(10, Number.isFinite(dataMax) ? Math.ceil((dataMax + 6) / 10) * 10 : 20);
  const minDb = minDbProp ?? Math.max(maxDb - 120, Math.min(0, maxDb - 40, Number.isFinite(dataMin) ? Math.floor((dataMin - 6) / 10) * 10 : -60));
  const { ref, width, height } = usePlotSize<HTMLDivElement>({ width: fixedWidth, height: fixedHeight });
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const curves: ResponseSeries[] = series ?? [{ label: "", points, color: "#18181b" }];
    const axisPoints = curves.find((c) => c.points.length > 0)?.points;
    if (!canvas || !axisPoints) return;
    const ctx = prepareCanvas(canvas, width, height);
    if (!ctx) return;

    const area = plotArea(width, height);
    const { xOf, yOf } = drawLogDbAxes(ctx, area, {
      fMin: axisPoints[0].frequencyHz,
      fMax: axisPoints[axisPoints.length - 1].frequencyHz,
      minDb,
      maxDb,
      freqLabels: LABEL_FREQS,
    });

    // 0dB reference line.
    ctx.strokeStyle = "#d4d4d8";
    ctx.beginPath();
    ctx.moveTo(area.left, yOf(0));
    ctx.lineTo(area.right, yOf(0));
    ctx.stroke();

    ctx.save();
    ctx.beginPath();
    ctx.rect(area.left, area.top, area.right - area.left, area.bottom - area.top);
    ctx.clip();
    if (band && !series && band.minDb.length === points.length) {
      ctx.fillStyle = "rgba(37, 99, 235, 0.12)";
      ctx.beginPath();
      points.forEach((p, i) => ctx.lineTo(xOf(p.frequencyHz), yOf(band.maxDb[i])));
      for (let i = points.length - 1; i >= 0; i--) ctx.lineTo(xOf(points[i].frequencyHz), yOf(band.minDb[i]));
      ctx.closePath();
      ctx.fill();
    }

    for (const curve of curves) {
      ctx.strokeStyle = curve.color;
      ctx.lineWidth = 2;
      ctx.lineJoin = "round";
      ctx.beginPath();
      curve.points.forEach((p, i) => {
        const x = xOf(p.frequencyHz);
        const y = yOf(p.magnitudeDb);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }
    ctx.restore();
  }, [points, series, width, height, minDb, maxDb, band]);

  return (
    <div ref={ref} className="plot-box" style={fixedHeight ? { height: fixedHeight, minHeight: 0 } : undefined}>
      <canvas ref={canvasRef} role="img" aria-label="주파수 응답 그래프" />
    </div>
  );
}
