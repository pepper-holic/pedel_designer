import { useEffect, useRef } from "react";

export interface WaveformTrace {
  label: string;
  data: Float64Array;
  color: string;
}

interface WaveformProps {
  traces: WaveformTrace[];
  width?: number;
  heightPerTrace?: number;
}

/** Stacks each trace in its own auto-scaled band so a millivolt input and a multi-volt output are both legible. */
export function Waveform({ traces, width = 800, heightPerTrace = 120 }: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const height = heightPerTrace * Math.max(traces.length, 1);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);

    traces.forEach((trace, index) => {
      const top = index * heightPerTrace;
      const mid = top + heightPerTrace / 2;

      let peak = 1e-9;
      for (const v of trace.data) peak = Math.max(peak, Math.abs(v));

      ctx.strokeStyle = "#d3d9c1";
      ctx.beginPath();
      ctx.moveTo(0, mid);
      ctx.lineTo(width, mid);
      ctx.stroke();

      ctx.strokeStyle = trace.color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      const n = trace.data.length;
      for (let x = 0; x < width; x++) {
        const sampleIndex = Math.floor((x / width) * n);
        const y = mid - (trace.data[sampleIndex] / peak) * (heightPerTrace / 2 - 4);
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      ctx.fillStyle = trace.color;
      ctx.font = "12px 'JetBrains Mono', monospace";
      ctx.fillText(`${trace.label} (peak ${peak.toFixed(3)} V)`, 6, top + 14);
    });
  }, [traces, width, height, heightPerTrace]);

  return <canvas ref={canvasRef} width={width} height={height} style={{ width: "100%", display: "block" }} />;
}
