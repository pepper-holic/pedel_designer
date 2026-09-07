import { useEffect, useRef } from "react";
import type { AcPoint } from "../core/solver/ac";

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
  width?: number;
  height?: number;
  minDb?: number;
  maxDb?: number;
  /** Optional Monte Carlo tolerance band - same length/frequency alignment as `points`. */
  band?: { minDb: number[]; maxDb: number[] };
}

const LABEL_FREQS = [20, 100, 1000, 10000, 20000];

/** Bode magnitude plot: log-scaled frequency axis, linear dB axis. */
export function FrequencyResponse({ points, series, width = 800, height = 260, minDb = -60, maxDb = 20, band }: FrequencyResponseProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const curves: ResponseSeries[] = series ?? [{ label: "", points, color: "#3c6b2e" }];
    const axisPoints = curves.find((c) => c.points.length > 0)?.points;
    if (!canvas || !axisPoints) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const fMin = axisPoints[0].frequencyHz;
    const fMax = axisPoints[axisPoints.length - 1].frequencyHz;
    const logMin = Math.log10(fMin);
    const logMax = Math.log10(fMax);
    const xOf = (f: number) => ((Math.log10(f) - logMin) / (logMax - logMin)) * width;
    const yOf = (db: number) => height - ((db - minDb) / (maxDb - minDb)) * height;

    ctx.clearRect(0, 0, width, height);

    // Gridlines every 10dB, and labeled frequency markers.
    ctx.strokeStyle = "#e3e7d3";
    ctx.fillStyle = "#8b8e75";
    ctx.font = "11px 'JetBrains Mono', monospace";
    for (let db = minDb; db <= maxDb; db += 10) {
      const y = yOf(db);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
      ctx.fillText(`${db}dB`, 4, y - 2);
    }
    for (const f of LABEL_FREQS) {
      if (f < fMin || f > fMax) continue;
      const x = xOf(f);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
      ctx.fillText(f >= 1000 ? `${f / 1000}k` : `${f}`, x + 2, height - 4);
    }

    // 0dB reference line.
    ctx.strokeStyle = "#b8bda3";
    ctx.beginPath();
    ctx.moveTo(0, yOf(0));
    ctx.lineTo(width, yOf(0));
    ctx.stroke();

    if (band && !series && band.minDb.length === points.length) {
      ctx.fillStyle = "rgba(60, 107, 46, 0.18)";
      ctx.beginPath();
      points.forEach((p, i) => ctx.lineTo(xOf(p.frequencyHz), yOf(band.maxDb[i])));
      for (let i = points.length - 1; i >= 0; i--) ctx.lineTo(xOf(points[i].frequencyHz), yOf(band.minDb[i]));
      ctx.closePath();
      ctx.fill();
    }

    for (const curve of curves) {
      ctx.strokeStyle = curve.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      curve.points.forEach((p, i) => {
        const x = xOf(p.frequencyHz);
        const y = yOf(p.magnitudeDb);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }
  }, [points, series, width, height, minDb, maxDb, band]);

  return <canvas ref={canvasRef} width={width} height={height} style={{ width: "100%", display: "block" }} />;
}
