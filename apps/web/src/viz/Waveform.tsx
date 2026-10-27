import { useEffect, useRef, useState } from "react";
import { prepareCanvas, usePlotSize } from "./usePlotSize";
import { interpolate } from "./bandlimited";

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
/** Narrowest view, in samples - a handful of periods of the top octave. */
const MIN_SAMPLES = 24;
interface View {
  traces: WaveformTrace[];
  /** Visible window as fractions of the whole run. */
  start: number;
  end: number;
}

function formatTime(seconds: number, span: number): string {
  if (span < 0.02) return `${(seconds * 1000).toFixed(2)}ms`;
  if (span < 0.5) return `${(seconds * 1000).toFixed(0)}ms`;
  return `${seconds.toFixed(2)}s`;
}

/**
 * Stacks each trace in its own auto-scaled band so a millivolt input and a multi-volt output are
 * both legible. Zoom with the wheel (around the cursor), drag to pan, double-click to see it all.
 * Zoomed out, each pixel column shows the min-max envelope as a filled band; zoomed in past one
 * sample per pixel, the waveform is reconstructed smoothly between samples.
 */
export function Waveform({ traces, heightPerTrace, durationSeconds }: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { ref, width, height: boxHeight } = usePlotSize<HTMLDivElement>();
  const count = Math.max(traces.length, 1);
  const axis = durationSeconds ? TIME_AXIS : 0;
  const band = heightPerTrace ?? Math.max(MIN_BAND, Math.floor((boxHeight - axis) / count));
  const height = band * count + axis;
  const length = traces.reduce((m, t) => Math.max(m, t.data.length), 0);
  // The window resets for a new run: it belongs to the traces it was set on.
  const [stored, setStored] = useState<View>({ traces, start: 0, end: 1 });
  const view = stored.traces === traces ? stored : { traces, start: 0, end: 1 };
  const drag = useRef<{ x: number; start: number; end: number } | null>(null);
  const latest = useRef({ view, width, length });
  useEffect(() => {
    latest.current = { view, width, length };
  });

  const setView = (start: number, end: number) => {
    const minSpan = length > 0 ? Math.min(1, MIN_SAMPLES / length) : 1;
    let span = Math.min(1, Math.max(minSpan, end - start));
    let s = start;
    if (span >= 1) {
      s = 0;
      span = 1;
    }
    s = Math.min(1 - span, Math.max(0, s));
    setStored({ traces, start: s, end: s + span });
  };
  const setViewRef = useRef(setView);
  useEffect(() => {
    setViewRef.current = setView;
  });

  // Wheel zoom needs a non-passive listener to keep the page from scrolling.
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const { view: v, width: w } = latest.current;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const at = Math.min(1, Math.max(0, (e.clientX - rect.left) / (rect.width || w)));
      const span = v.end - v.start;
      if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        const delta = (e.shiftKey ? e.deltaY : e.deltaX) * 0.002 * span;
        setViewRef.current(v.start + delta, v.end + delta);
        return;
      }
      const factor = Math.exp(e.deltaY * 0.0025);
      const pivot = v.start + at * span;
      setViewRef.current(pivot - (pivot - v.start) * factor, pivot + (v.end - pivot) * factor);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = prepareCanvas(canvas, width, height);
    if (!ctx) return;
    const s0 = view.start * length;
    const s1 = view.end * length;
    const perPixel = (s1 - s0) / width;

    traces.forEach((trace, index) => {
      const top = index * band;
      const mid = top + band / 2;
      const { data } = trace;
      let peak = 1e-9;
      for (const v of data) peak = Math.max(peak, Math.abs(v));
      const scale = (band / 2 - 6) / peak;
      const y = (v: number) => mid - v * scale;

      if (index > 0) {
        ctx.strokeStyle = "#ececef";
        ctx.beginPath();
        ctx.moveTo(0, top + 0.5);
        ctx.lineTo(width, top + 0.5);
        ctx.stroke();
      }
      ctx.strokeStyle = "#d4d4d8";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, Math.round(mid) + 0.5);
      ctx.lineTo(width, Math.round(mid) + 0.5);
      ctx.stroke();

      ctx.save();
      ctx.beginPath();
      ctx.rect(0, top, width, band);
      ctx.clip();
      if (perPixel >= 1) {
        // Envelope: the min-max of each pixel column as one filled shape - smooth at any zoom,
        // where per-column vertical strokes looked like a comb.
        const lo = new Float64Array(width);
        const hi = new Float64Array(width);
        for (let x = 0; x < width; x++) {
          const from = Math.floor(s0 + x * perPixel);
          const to = Math.max(from + 1, Math.floor(s0 + (x + 1) * perPixel));
          let a = Infinity;
          let b = -Infinity;
          for (let i = from; i < to && i < data.length; i++) {
            if (data[i] < a) a = data[i];
            if (data[i] > b) b = data[i];
          }
          lo[x] = Number.isFinite(a) ? a : 0;
          hi[x] = Number.isFinite(b) ? b : 0;
        }
        ctx.beginPath();
        ctx.moveTo(0, y(hi[0]));
        for (let x = 1; x < width; x++) ctx.lineTo(x, y(hi[x]));
        for (let x = width - 1; x >= 0; x--) ctx.lineTo(x, y(lo[x]));
        ctx.closePath();
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = trace.color;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = trace.color;
        ctx.lineWidth = 1;
        ctx.stroke();
      } else {
        // Zoomed in: a smooth, band-limited curve between the samples, two points per pixel.
        ctx.strokeStyle = trace.color;
        ctx.lineWidth = 1.6;
        ctx.lineJoin = "round";
        ctx.beginPath();
        for (let px = 0; px <= width * 2; px++) {
          const x = px / 2;
          const v = interpolate(data, s0 + x * perPixel);
          if (px === 0) ctx.moveTo(x, y(v));
          else ctx.lineTo(x, y(v));
        }
        ctx.stroke();
        // Close enough to tell samples apart: mark them.
        if (perPixel < 0.12) {
          ctx.fillStyle = trace.color;
          for (let i = Math.max(0, Math.floor(s0)); i <= Math.min(data.length - 1, Math.ceil(s1)); i++) {
            ctx.beginPath();
            ctx.arc((i - s0) / perPixel, y(data[i]), 2.2, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
      ctx.restore();

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
      ctx.fillStyle = "#71717a";
      ctx.textBaseline = "top";
      const t0 = view.start * durationSeconds;
      const span = (view.end - view.start) * durationSeconds;
      const yAxis = band * count + 2;
      const steps = Math.max(1, Math.min(10, Math.floor(width / 90)));
      for (let i = 0; i <= steps; i++) {
        const x = (i / steps) * width;
        ctx.textAlign = i === 0 ? "left" : i === steps ? "right" : "center";
        ctx.fillText(formatTime(t0 + (i / steps) * span, span), x, yAxis);
      }
      ctx.textAlign = "start";
      ctx.textBaseline = "alphabetic";
    }
  }, [traces, width, height, band, count, durationSeconds, view.start, view.end, length]);

  const zoomed = view.start > 0 || view.end < 1;

  return (
    <div ref={ref} className="plot-box plot-scroll" style={heightPerTrace ? { height, minHeight: 0 } : undefined}>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={`파형: ${traces.map((t) => t.label).join(", ")}`}
        style={{ cursor: zoomed ? "grab" : "zoom-in", touchAction: "none" }}
        title="휠: 확대/축소 · 드래그: 이동 · 더블클릭: 전체 보기"
        onPointerDown={(e) => {
          (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
          drag.current = { x: e.clientX, start: view.start, end: view.end };
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          const span = drag.current.end - drag.current.start;
          const delta = (-(e.clientX - drag.current.x) / (width || 1)) * span;
          setView(drag.current.start + delta, drag.current.end + delta);
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
        onDoubleClick={() => setView(0, 1)}
      />
      {zoomed && (
        <button type="button" className="waveform-reset" onClick={() => setView(0, 1)}>
          전체 보기 ({Math.round(1 / (view.end - view.start))}×)
        </button>
      )}
    </div>
  );
}
