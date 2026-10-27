import { useEffect, useRef } from "react";
import { prepareCanvas, usePlotSize } from "./usePlotSize";

export interface WaveformTrace {
  label: string;
  data: Float64Array;
  color: string;
}

interface WaveformProps {
  traces: WaveformTrace[];
  /** Pin each band's height; by default the traces share the box's height. */
  heightPerTrace?: number;
  /** Seconds of audio the traces span, for the time axis. */
  durationSeconds?: number;
}

/** A band never gets shorter than this - below it the trace is a smudge; the box scrolls instead. */
const MIN_BAND = 48;
const TIME_AXIS = 16;

/**
 * Stacks each trace in its own auto-scaled band so a millivolt input and a multi-volt output are
 * both legible. The bands share the box's height, so every trace is on screen at once.
 */
export function Waveform({ traces, heightPerTrace, durationSeconds }: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { ref, width, height: boxHeight } = usePlotSize<HTMLDivElement>();
  const count = Math.max(traces.length, 1);
  const axis = durationSeconds ? TIME_AXIS : 0;
  const band = heightPerTrace ?? Math.max(MIN_BAND, Math.floor((boxHeight - axis) / count));
  const height = band * count + axis;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = prepareCanvas(canvas, width, height);
    if (!ctx) return;

    traces.forEach((trace, index) => {
      const top = index * band;
      const mid = top + band / 2;

      let peak = 1e-9;
      for (const v of trace.data) peak = Math.max(peak, Math.abs(v));

      if (index > 0) {
        ctx.strokeStyle = "#e3e7d3";
        ctx.beginPath();
        ctx.moveTo(0, top + 0.5);
        ctx.lineTo(width, top + 0.5);
        ctx.stroke();
      }
      ctx.strokeStyle = "#d3d9c1";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, mid);
      ctx.lineTo(width, mid);
      ctx.stroke();

      // Min/max per pixel column: a dense audio trace keeps its envelope instead of aliasing.
      ctx.strokeStyle = trace.color;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      const n = trace.data.length;
      const scale = (band / 2 - 6) / peak;
      for (let x = 0; x < width; x++) {
        const from = Math.floor((x / width) * n);
        const to = Math.max(from + 1, Math.floor(((x + 1) / width) * n));
        let lo = Infinity;
        let hi = -Infinity;
        for (let i = from; i < to && i < n; i++) {
          lo = Math.min(lo, trace.data[i]);
          hi = Math.max(hi, trace.data[i]);
        }
        if (x === 0) ctx.moveTo(x, mid - hi * scale);
        else ctx.lineTo(x, mid - hi * scale);
        if (lo !== hi) ctx.lineTo(x, mid - lo * scale);
      }
      ctx.stroke();

      const label = `${trace.label} (peak ${peak.toFixed(3)} V)`;
      ctx.font = "12px 'JetBrains Mono', monospace";
      const w = ctx.measureText(label).width;
      ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
      ctx.fillRect(4, top + 3, w + 6, 16);
      ctx.fillStyle = trace.color;
      ctx.fillText(label, 7, top + 15);
    });

    if (durationSeconds) {
      ctx.font = "11px 'JetBrains Mono', monospace";
      ctx.fillStyle = "#6f735a";
      ctx.textBaseline = "top";
      const y = band * count + 2;
      const steps = Math.max(1, Math.min(10, Math.floor(width / 90)));
      for (let i = 0; i <= steps; i++) {
        const x = (i / steps) * width;
        ctx.textAlign = i === 0 ? "left" : i === steps ? "right" : "center";
        ctx.fillText(`${((i / steps) * durationSeconds).toFixed(2)}s`, x, y);
      }
      ctx.textAlign = "start";
      ctx.textBaseline = "alphabetic";
    }
  }, [traces, width, height, band, count, durationSeconds]);

  return (
    <div ref={ref} className="plot-box plot-scroll" style={heightPerTrace ? { height, minHeight: 0 } : undefined}>
      <canvas ref={canvasRef} role="img" aria-label={`파형: ${traces.map((t) => t.label).join(", ")}`} />
    </div>
  );
}
