/** Colour key for a multi-curve plot (probe overlays, knob sweeps). */
export function SeriesLegend({ series }: { series: { label: string; color: string; dashed?: boolean }[] }) {
  return (
    <div className="sweep-legend">
      {series.map((s) => (
        <span key={s.label} className="sweep-legend-item">
          <span
            className="sweep-legend-swatch"
            style={s.dashed ? { background: `repeating-linear-gradient(90deg, ${s.color} 0 4px, transparent 4px 7px)` } : { background: s.color }}
          />
          {s.label}
        </span>
      ))}
    </div>
  );
}
