import { PART_DEFS } from "./partDefs";
import { PartSymbol } from "./symbols";
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
 * One placed part: hit-box, symbol and terminals. Its id/value text is drawn separately by
 * CanvasLabelLayer, which places every part's and net's labels together so they can avoid each
 * other and the wires - see layout/labels.ts.
 *
 * Rotation is scoped to an inner group (symbol + terminals only) rather than the outer one, so a
 * rotated part's terminals land correctly without needing the (separately drawn) label text to
 * counter-rotate back upright.
 */
export function CanvasPart({ part, isSelected, pendingTerminal, onBodyMouseDown, onTerminalClick }: CanvasPartProps) {
  const def = PART_DEFS[part.type];

  return (
    <g data-part-id={part.id} transform={`translate(${part.x},${part.y})`}>
      {isSelected && (
        <rect
          x={-PART_HALF_WIDTH}
          y={-PART_HALF_HEIGHT}
          width={PART_HALF_WIDTH * 2}
          height={PART_HALF_HEIGHT * 2}
          rx={2}
          fill="none"
          stroke="var(--select)"
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
      <g transform={part.mirror ? `rotate(${part.rotation}) scale(1,-1)` : `rotate(${part.rotation})`}>
        <PartSymbol part={part} />
        {def.terminals.map((t) => (
          <circle
            key={t.id}
            cx={t.dx}
            cy={t.dy}
            r={4}
            fill={pendingTerminal?.partId === part.id && pendingTerminal.terminalId === t.id ? "var(--select)" : "var(--wire)"}
            onClick={(e) => onTerminalClick({ partId: part.id, terminalId: t.id }, e)}
            style={{ cursor: "crosshair" }}
          />
        ))}
      </g>
    </g>
  );
}
