import { useEffect, useRef, useState } from "react";
import type { Spectrum as SpectrumData } from "../core/analysis/spectrum";

export interface SpectrumSeries {
  label: string;
  spectrum: SpectrumData;
  color: string;
  /** Drawn dashed and thinner - used for the dry input reference. */
  dashed?: boolean;
}

interface SpectrumProps {
  series: SpectrumSeries[];
  width?: number;
  height?: number;
  minHz?: number;
  maxHz?: number;
  /** Vertical span below the loudest bin shown. 100dB covers a clean signal's harmonics without
   * spending the plot on the solver's numerical noise floor. */
  rangeDb?: number;
}

const LABEL_FREQS = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];

function formatHz(f: number): string {
  return f >= 1000 ? `${(f / 1000).toFixed(f >= 10000 ? 1 : 2)}kHz` : `${f.toFixed(0)}Hz`;
}

/** Index of the bin nearest `f` (bins are evenly spaced from 0Hz). */
function binOf(spectrum: SpectrumData, f: number): number {
  const step = spectrum.frequenciesHz[1] - spectrum.frequenciesHz[0] || 1;
  return Math.min(spectrum.frequenciesHz.length - 1, Math.max(0, Math.round(f / step)));
}

/**
 * Magnitude spectrum plot: log frequency axis, dB axis anchored to the loudest bin. Hovering reads
 * out every series' level at the cursor frequency - the way to answer "how loud is the 3rd harmonic
 * after the clipper versus before it".
 */
export function Spectrum({ series, width = 800, height = 260, minHz = 20, maxHz = 20000, rangeDb = 100 }: SpectrumProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoverHz, setHoverHz] = useState<number | null>(null);

  let peakDb = -Infinity;
  for (const s of series) {
    for (let k = 0; k < s.spectrum.frequenciesHz.length; k++) {
      const f = s.spectrum.frequenciesHz[k];
      if (f >= minHz && f <= maxHz) peakDb = Math.max(peakDb, s.spectrum.magnitudeDb[k]);
    }
  }
  const maxDb = Number.isFinite(peakDb) ? Math.ceil((peakDb + 3) / 10) * 10 : 0;
  const minDb = maxDb - rangeDb;
  const logMin = Math.log10(minHz);
  const logMax = Math.log10(maxHz);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const xOf = (f: number) => ((Math.log10(f) - logMin) / (logMax - logMin)) * width;
    const yOf = (db: number) => height - ((Math.max(db, minDb) - minDb) / (maxDb - minDb)) * height;

    ctx.clearRect(0, 0, width, height);
    ctx.strokeStyle = "#e3e7d3";
    ctx.fillStyle = "#6f735a";
    ctx.font = "11px 'JetBrains Mono', monospace";
    ctx.lineWidth = 1;
    for (let db = minDb; db <= maxDb; db += 10) {
      const y = yOf(db);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
      ctx.fillText(`${db}dB`, 4, y - 2);
    }
    for (const f of LABEL_FREQS) {
      if (f < minHz || f > maxHz) continue;
      const x = xOf(f);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
      ctx.fillText(f >= 1000 ? `${f / 1000}k` : `${f}`, x + 2, height - 4);
    }

    for (const s of series) {
      const { frequenciesHz, magnitudeDb } = s.spectrum;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.dashed ? 1 : 1.5;
      ctx.setLineDash(s.dashed ? [4, 3] : []);
      ctx.beginPath();
      // Many bins land on one pixel column at the top of a log axis; drawing the max per column keeps
      // narrow harmonic peaks visible instead of letting the last bin in the column win.
      let column = -1;
      let columnMax = -Infinity;
      let started = false;
      const flush = () => {
        if (column < 0) return;
        const y = yOf(columnMax);
        if (!started) {
          ctx.moveTo(column, y);
          started = true;
        } else ctx.lineTo(column, y);
      };
      for (let k = 1; k < frequenciesHz.length; k++) {
        const f = frequenciesHz[k];
        if (f < minHz || f > maxHz) continue;
        const x = Math.round(xOf(f));
        if (x !== column) {
          flush();
          column = x;
          columnMax = -Infinity;
        }
        columnMax = Math.max(columnMax, magnitudeDb[k]);
      }
      flush();
      ctx.stroke();
    }
    ctx.setLineDash([]);

    if (hoverHz !== null) {
      ctx.strokeStyle = "#191a10";
      ctx.globalAlpha = 0.4;
      ctx.beginPath();
      ctx.moveTo(xOf(hoverHz), 0);
      ctx.lineTo(xOf(hoverHz), height);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }, [series, width, height, minDb, maxDb, logMin, logMax, minHz, maxHz, hoverHz]);

  const handleMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const fraction = (e.clientX - rect.left) / rect.width;
    setHoverHz(10 ** (logMin + fraction * (logMax - logMin)));
  };

  return (
    <div>
      <div className="spectrum-readout" aria-live="off">
        {hoverHz === null ? (
          <span>그래프 위에 커서를 올리면 그 주파수의 레벨을 보여줍니다.</span>
        ) : (
          <>
            <strong>{formatHz(hoverHz)}</strong>
            {series.map((s) => (
              <span key={s.label} style={{ color: s.color }}>
                {s.label} {s.spectrum.magnitudeDb[binOf(s.spectrum, hoverHz)].toFixed(1)}dB
              </span>
            ))}
          </>
        )}
      </div>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        style={{ width: "100%", display: "block" }}
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverHz(null)}
        role="img"
        aria-label={`스펙트럼: ${series.map((s) => s.label).join(", ")}`}
      />
    </div>
  );
}
