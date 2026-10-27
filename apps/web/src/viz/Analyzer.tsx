import { useEffect, useMemo, useRef, useState } from "react";
import type { Spectrum } from "../core/analysis/spectrum";
import { logGrid, makeScratch, noteName, smoothSpectrum, tiltDb, type SmoothingScratch } from "../core/analysis/octaveSmoothing";
import { ANALYSER_TO_PEAK_DB, currentAnalyzerBus, onAnalyzerActivity, type AnalyzerBus } from "../audio/analyzerBus";
import { SPEED_SECONDS, useAnalyzerSettings, type AnalyzerSettings } from "./analyzerSettings";
import { drawLogDbAxes, plotArea, prepareCanvas, usePlotSize, type PlotArea } from "./usePlotSize";

export interface AnalyzerSeries {
  label: string;
  color: string;
  /** Drawn as a dashed line without fill - used for the dry input reference. */
  dashed?: boolean;
  spectrum: Spectrum;
}

const LIVE_COLORS = { post: "#2563eb", pre: "#a1a1aa" };

const F_MIN = 20;
const F_MAX = 20000;
const LABEL_FREQS = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
/** How fast a held peak falls, dB per second. */
const PEAK_FALL = 12;
/** Live curves stay up this long after the sound stops, decaying, before the plot goes static. */
const LINGER_SECONDS = 1.5;

interface LiveState {
  grid: Float64Array | null;
  /** Averaged power per grid point. */
  pre: Float64Array | null;
  post: Float64Array | null;
  /** Held peak per grid point, dB. */
  peak: Float64Array | null;
  buffers: Map<number, Float32Array<ArrayBuffer>>;
  smoothed: Float64Array | null;
  scratch: SmoothingScratch | null;
  lastFrame: number;
  lastActive: number;
  /** Top of the live curves, rising at once and easing down. */
  top: number;
  running: boolean;
}

/** `color` with an alpha, for gradient stops (accepts #rrggbb; anything else is used as is). */
function withAlpha(color: string, alpha: number): string {
  if (!/^#[0-9a-f]{6}$/i.test(color)) return color;
  return (
    color +
    Math.round(alpha * 255)
      .toString(16)
      .padStart(2, "0")
  );
}

/** A smooth, filled curve through (x, y) points: quadratic segments between midpoints. */
function curve(ctx: CanvasRenderingContext2D, xs: Float64Array, ys: Float64Array) {
  ctx.moveTo(xs[0], ys[0]);
  for (let i = 1; i < xs.length - 1; i++) ctx.quadraticCurveTo(xs[i], ys[i], (xs[i] + xs[i + 1]) / 2, (ys[i] + ys[i + 1]) / 2);
  ctx.lineTo(xs[xs.length - 1], ys[ys.length - 1]);
}

function drawCurve(
  ctx: CanvasRenderingContext2D,
  area: PlotArea,
  xs: Float64Array,
  ys: Float64Array,
  style: { color: string; fill: boolean; width: number; alpha: number; dashed?: boolean },
) {
  if (style.fill) {
    const gradient = ctx.createLinearGradient(0, area.top, 0, area.bottom);
    gradient.addColorStop(0, withAlpha(style.color, 0.33));
    gradient.addColorStop(1, withAlpha(style.color, 0.02));
    ctx.fillStyle = gradient;
    ctx.beginPath();
    curve(ctx, xs, ys);
    ctx.lineTo(xs[xs.length - 1], area.bottom);
    ctx.lineTo(xs[0], area.bottom);
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalAlpha = style.alpha;
  ctx.strokeStyle = style.color;
  ctx.lineWidth = style.width;
  ctx.lineJoin = "round";
  ctx.setLineDash(style.dashed ? [5, 4] : []);
  ctx.beginPath();
  curve(ctx, xs, ys);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
}

/**
 * Spectrum analyzer in the style of FabFilter Pro-Q: fractional-octave smoothing on a log axis,
 * smooth filled curves, and - whenever the circuit is being heard (real-time playback, result
 * playback, knob previews) - a live RTA of the circuit's input and output with peak hold, fed by
 * the analyzer bus. `series` are fixed spectra (the last simulation) shown underneath.
 */
export function Analyzer({ series, height: fixedHeight }: { series: AnalyzerSeries[]; height?: number }) {
  const settings = useAnalyzerSettings();
  const { ref, width, height } = usePlotSize<HTMLDivElement>({ height: fixedHeight });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hoverX = useRef<number | null>(null);
  const [liveShown, setLiveShown] = useState(false);
  const area = plotArea(width, height);
  const gridCount = Math.max(32, Math.round((area.right - area.left) / 2));
  const grid = useMemo(() => logGrid(F_MIN, F_MAX, gridCount), [gridCount]);

  // Fixed spectra, smoothed and tilted once per change rather than every frame.
  const fixed = useMemo(
    () =>
      series.map((s) => {
        const binHz = s.spectrum.frequenciesHz[1] - s.spectrum.frequenciesHz[0] || 1;
        const db = smoothSpectrum(s.spectrum.magnitudeDb, binHz, grid, settings.smoothing);
        for (let i = 0; i < grid.length; i++) db[i] += tiltDb(grid[i], settings.tilt);
        return { ...s, db };
      }),
    [series, grid, settings.smoothing, settings.tilt],
  );

  const live = useRef<LiveState>({
    grid: null,
    pre: null,
    post: null,
    peak: null,
    buffers: new Map(),
    smoothed: null,
    scratch: null,
    lastFrame: 0,
    lastActive: 0,
    top: -Infinity,
    running: false,
  });
  const state = useRef({ fixed, settings, grid, width, height });
  useEffect(() => {
    state.current = { fixed, settings, grid, width, height };
  });

  /** Pulls a frame from the bus into the averaged live curves. */
  const sample = (bus: AnalyzerBus, now: number, s: AnalyzerSettings, g: Float64Array) => {
    const l = live.current;
    if (l.grid !== g) {
      l.grid = g;
      l.pre = new Float64Array(g.length);
      l.post = new Float64Array(g.length);
      l.peak = new Float64Array(g.length).fill(-Infinity);
      l.smoothed = new Float64Array(g.length);
    }
    const dt = l.lastFrame ? Math.min(0.25, (now - l.lastFrame) / 1000) : 1 / 60;
    l.lastFrame = now;
    const keep = Math.exp(-dt / SPEED_SECONDS[s.speed]);
    for (const key of ["pre", "post"] as const) {
      const node = bus[key];
      if (node.fftSize !== s.resolution) node.fftSize = s.resolution;
      const bins = node.frequencyBinCount;
      let buffer = l.buffers.get(bins);
      if (!buffer) l.buffers.set(bins, (buffer = new Float32Array(bins)));
      if (!l.scratch || l.scratch.power.length !== bins) l.scratch = makeScratch(bins);
      node.getFloatFrequencyData(buffer);
      const smoothed = smoothSpectrum(buffer, bus.context.sampleRate / node.fftSize, g, s.smoothing, l.smoothed!, l.scratch);
      const avg = l[key]!;
      for (let i = 0; i < g.length; i++) {
        const power = 10 ** ((smoothed[i] + ANALYSER_TO_PEAK_DB) / 10);
        avg[i] = avg[i] * keep + power * (1 - keep);
      }
    }
    let frameTop = -Infinity;
    for (let i = 0; i < g.length; i++) {
      const db = 10 * Math.log10(l.post![i] + 1e-30) + tiltDb(g[i], s.tilt);
      l.peak![i] = Math.max(l.peak![i] - PEAK_FALL * dt, db);
      frameTop = Math.max(frameTop, db, 10 * Math.log10(l.pre![i] + 1e-30) + tiltDb(g[i], s.tilt));
    }
    l.top = frameTop > l.top ? frameTop : l.top - 6 * dt;
  };

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { fixed: curves, settings: s, grid: g, width: w, height: h } = state.current;
    const ctx = prepareCanvas(canvas, w, h);
    if (!ctx) return;
    const a = plotArea(w, h);
    const l = live.current;
    const liveVisible = l.running && l.post !== null && l.grid === g;

    let top = -Infinity;
    for (const c of curves) for (const v of c.db) top = Math.max(top, v);
    if (liveVisible) top = Math.max(top, l.top);
    const maxDb = Number.isFinite(top) ? Math.ceil((top + 6) / 6) * 6 : 0;
    const minDb = maxDb - s.range;
    const { xOf, yOf } = drawLogDbAxes(ctx, a, { fMin: F_MIN, fMax: F_MAX, minDb, maxDb, freqLabels: LABEL_FREQS });
    const xs = Float64Array.from(g, (f) => xOf(f));
    const ys = new Float64Array(g.length);
    const toY = (db: number) => yOf(Math.min(maxDb, Math.max(minDb, db)));

    ctx.save();
    ctx.beginPath();
    ctx.rect(a.left, a.top, a.right - a.left, a.bottom - a.top);
    ctx.clip();
    for (const c of curves) {
      for (let i = 0; i < g.length; i++) ys[i] = toY(c.db[i]);
      // Under a live analysis the fixed spectra step back to thin reference lines.
      drawCurve(ctx, a, xs, ys, {
        color: c.color,
        fill: !liveVisible && !c.dashed,
        width: c.dashed ? 1 : 1.6,
        alpha: liveVisible ? 0.45 : 1,
        dashed: c.dashed,
      });
    }
    if (liveVisible) {
      for (const [key, color] of [
        ["pre", LIVE_COLORS.pre],
        ["post", LIVE_COLORS.post],
      ] as const) {
        const avg = l[key]!;
        for (let i = 0; i < g.length; i++) ys[i] = toY(10 * Math.log10(avg[i] + 1e-30) + tiltDb(g[i], s.tilt));
        drawCurve(ctx, a, xs, ys, { color, fill: true, width: key === "post" ? 1.8 : 1.2, alpha: 1 });
      }
      if (s.peakHold) {
        for (let i = 0; i < g.length; i++) ys[i] = toY(l.peak![i]);
        drawCurve(ctx, a, xs, ys, { color: LIVE_COLORS.post, fill: false, width: 1, alpha: 0.55 });
      }
    }
    ctx.restore();

    // Hover: cursor line and a readout of every curve at that frequency.
    const hx = hoverX.current;
    if (hx !== null && hx >= a.left && hx <= a.right) {
      const f = F_MIN * (F_MAX / F_MIN) ** ((hx - a.left) / (a.right - a.left));
      let i = 0;
      while (i < g.length - 1 && g[i] < f) i++;
      const parts = [`${f >= 1000 ? `${(f / 1000).toFixed(2)}kHz` : `${f.toFixed(0)}Hz`}  ${noteName(f)}`];
      for (const c of curves) parts.push(`${c.label} ${c.db[i].toFixed(1)}dB`);
      if (liveVisible) {
        parts.push(`실시간 출력 ${(10 * Math.log10(l.post![i] + 1e-30) + tiltDb(g[i], s.tilt)).toFixed(1)}dB`);
        parts.push(`실시간 입력 ${(10 * Math.log10(l.pre![i] + 1e-30) + tiltDb(g[i], s.tilt)).toFixed(1)}dB`);
      }
      ctx.strokeStyle = "rgba(24, 24, 27, 0.45)";
      ctx.beginPath();
      ctx.moveTo(hx + 0.5, a.top);
      ctx.lineTo(hx + 0.5, a.bottom);
      ctx.stroke();
      ctx.font = "11px 'JetBrains Mono', monospace";
      const text = parts.join("  ·  ");
      const tw = ctx.measureText(text).width;
      const tx = Math.min(Math.max(a.left + 4, hx + 8), a.right - tw - 8);
      ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
      ctx.fillRect(tx - 4, a.top + 4, tw + 8, 18);
      ctx.fillStyle = "#18181b";
      ctx.fillText(text, tx, a.top + 17);
    }
  };
  const drawRef = useRef(draw);
  useEffect(() => {
    drawRef.current = draw;
  });

  // Redraw whenever what is shown changes (the live loop redraws on its own).
  useEffect(() => {
    if (!live.current.running) drawRef.current();
  }, [fixed, settings, grid, width, height]);

  // The live loop: runs while anything feeds the analyzer bus, and a little after.
  useEffect(() => {
    let frame = 0;
    const l = live.current;
    const tick = (now: number) => {
      const bus = currentAnalyzerBus();
      if (!bus) return;
      if (bus.active > 0) l.lastActive = now;
      const { settings: s, grid: g } = state.current;
      sample(bus, now, s, g);
      drawRef.current();
      if (bus.active > 0 || now - l.lastActive < LINGER_SECONDS * 1000) {
        frame = requestAnimationFrame(tick);
      } else {
        l.running = false;
        l.grid = null;
        l.lastFrame = 0;
        l.top = -Infinity;
        setLiveShown(false);
        drawRef.current();
      }
    };
    const wake = () => {
      const bus = currentAnalyzerBus();
      if (!bus || bus.active === 0 || l.running || typeof requestAnimationFrame === "undefined") return;
      l.running = true;
      l.lastActive = performance.now();
      setLiveShown(true);
      frame = requestAnimationFrame(tick);
    };
    wake();
    const unsubscribe = onAnalyzerActivity(wake);
    return () => {
      unsubscribe();
      cancelAnimationFrame(frame);
      l.running = false;
    };
    // `sample` only reads refs; the loop picks up new settings through `state`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="plot-stack">
      <div className="analyzer-legend" aria-live="off">
        {liveShown ? (
          <>
            <span className="analyzer-live-dot" /> RTA
            <span style={{ color: LIVE_COLORS.post }}>━ 출력 (실시간)</span>
            <span style={{ color: LIVE_COLORS.pre }}>━ 입력 (실시간)</span>
            {settings.peakHold && <span style={{ color: LIVE_COLORS.post, opacity: 0.6 }}>─ 피크 홀드</span>}
          </>
        ) : (
          <span title="실시간 재생, 결과 재생, 노브 미리듣기 중에 회로의 입력/출력 스펙트럼이 실시간으로 겹쳐집니다">
            재생하면 실시간 분석(RTA) · 커서: 주파수·음이름·레벨
          </span>
        )}
      </div>
      <div ref={ref} className="plot-box" style={fixedHeight ? { height: fixedHeight, minHeight: 0 } : undefined}>
        <canvas
          ref={canvasRef}
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            hoverX.current = ((e.clientX - rect.left) / (rect.width || 1)) * width;
            if (!live.current.running) draw();
          }}
          onMouseLeave={() => {
            hoverX.current = null;
            if (!live.current.running) draw();
          }}
          role="img"
          aria-label={`스펙트럼 분석기: ${series.map((s) => s.label).join(", ") || "실시간"}`}
        />
      </div>
    </div>
  );
}
