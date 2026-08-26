import { useEffect, useRef } from "react";
import type { AcPoint } from "../core/solver/ac";

interface FrequencyResponseProps {
  points: AcPoint[];
  width?: number;
  height?: number;
  minDb?: number;
  maxDb?: number;
}

const LABEL_FREQS = [20, 100, 1000, 10000, 20000];

/** Bode magnitude plot: log-scaled frequency axis, linear dB axis. */
export function FrequencyResponse({ points, width = 800, height = 260, minDb = -60, maxDb = 20 }: FrequencyResponseProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || points.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const fMin = points[0].frequencyHz;
    const fMax = points[points.length - 1].frequencyHz;
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

    ctx.strokeStyle = "#3c6b2e";
    ctx.lineWidth = 2;
    ctx.beginPath();
    points.forEach((p, i) => {
      const x = xOf(p.frequencyHz);
      const y = yOf(p.magnitudeDb);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }, [points, width, height, minDb, maxDb]);

  return <canvas ref={canvasRef} width={width} height={height} style={{ width: "100%", display: "block" }} />;
}
