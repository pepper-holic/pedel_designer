import { PART_DEFS } from "./partDefs";
import { PartSymbol } from "./symbols";
import { partValueLabel } from "./valueLabel";
import type { PartInstance, TerminalRef } from "./types";
import { PART_HALF_WIDTH, PART_HALF_HEIGHT } from "./partMetrics";


interface CanvasPartProps {
  part: PartInstance;
  isSelected: boolean;
  /** The first terminal of a wire being drawn, highlighted while it waits for the second click. */
  pendingTerminal: TerminalRef | null;
  onBodyMouseDown: (part: PartInstance, e: React.MouseEvent) => void;
  onTerminalClick: (ref: TerminalRef, e: React.MouseEvent) => void;
}

/**
 * One placed part: hit-box, symbol, terminals and labels.
 *
 * Rotation is scoped to an inner group (symbol + terminals only) rather than the outer one, so the
 * id/value text stays upright and stays put on screen instead of flipping upside-down - and sliding
 * to the opposite side - whenever a part is rotated 180, which auto-layout does routinely for
 * antiparallel diode pairs.
 */
export function CanvasPart({ part, isSelected, pendingTerminal, onBodyMouseDown, onTerminalClick }: CanvasPartProps) {
  const def = PART_DEFS[part.type];
  const valueLabel = partValueLabel(part);

  return (
    <g data-part-id={part.id} transform={`translate(${part.x},${part.y})`}>
      {isSelected && (
        <rect
          x={-PART_HALF_WIDTH}
          y={-PART_HALF_HEIGHT}
          width={PART_HALF_WIDTH * 2}
          height={PART_HALF_HEIGHT * 2}
          rx={6}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={1.2}
          strokeDasharray="3 2"
        />
      )}
      <rect
        x={-PART_HALF_WIDTH}
        y={-PART_HALF_HEIGHT}
        width={PART_HALF_WIDTH * 2}
        height={PART_HALF_HEIGHT * 2}
        fill="transparent"
        onMouseDown={(e) => onBodyMouseDown(part, e)}
        style={{ cursor: "grab", pointerEvents: "all" }}
      />
      <g transform={`rotate(${part.rotation})`}>
        <PartSymbol part={part} />
        {def.terminals.map((t) => (
          <circle
            key={t.id}
            cx={t.dx}
            cy={t.dy}
            r={4}
            fill={pendingTerminal?.partId === part.id && pendingTerminal.terminalId === t.id ? "var(--accent)" : "var(--wire)"}
            onClick={(e) => onTerminalClick({ partId: part.id, terminalId: t.id }, e)}
            style={{ cursor: "crosshair" }}
          />
        ))}
      </g>
      <rect x={-19} y={-39} width={38} height={11} fill="var(--bg-inset)" opacity={0.85} pointerEvents="none" />
      <text textAnchor="middle" y={-30} fill="var(--text-dim)" fontSize={10} fontFamily="var(--font-mono)" pointerEvents="none">
        {part.id}
      </text>
      {valueLabel && (
        <>
          <rect x={-24} y={39} width={48} height={11} fill="var(--bg-inset)" opacity={0.85} pointerEvents="none" />
          <text textAnchor="middle" y={46} fill="var(--text-dim)" fontSize={10} fontFamily="var(--font-mono)" pointerEvents="none">
            {valueLabel}
          </text>
        </>
      )}
    </g>
  );
}
