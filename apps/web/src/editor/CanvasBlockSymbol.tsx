import { BLOCK_CATEGORY_LABELS } from "./blocks";
import { BLOCK_HEADER_HEIGHT, BLOCK_KNOB_LINE, type BlockSymbolLayout } from "./blockGeometry";
import { knobReadout } from "./blockOps";
import type { BlockInstance, PartInstance, TerminalRef } from "./types";

interface CanvasBlockSymbolProps {
  block: BlockInstance;
  layout: BlockSymbolLayout;
  parts: PartInstance[];
  selected: boolean;
  pendingTerminal: TerminalRef | null;
  onBodyMouseDown: (block: BlockInstance, e: React.MouseEvent) => void;
  onPinClick: (ref: TerminalRef, e: React.MouseEvent) => void;
  onToggleCollapse: (blockId: string) => void;
}

/**
 * A collapsed block: a box with its name, its knobs' current settings, and a pin per port. Pins
 * wire like part terminals (they stand for a real terminal inside); the body drags the whole block;
 * double-click opens it up.
 */
export function CanvasBlockSymbol({ block, layout, parts, selected, pendingTerminal, onBodyMouseDown, onPinClick, onToggleCollapse }: CanvasBlockSymbolProps) {
  const stroke = `var(--block-${block.category}-stroke)`;
  const byId = new Map(parts.map((p) => [p.id, p]));
  return (
    <g data-block-id={block.id} data-collapsed="true">
      {layout.pins.map((pin) => (
        <line key={`stub-${pin.port.id}`} x1={pin.edgeX} y1={pin.edgeY} x2={pin.x} y2={pin.y} stroke="var(--wire)" strokeWidth={2} />
      ))}
      <rect
        x={layout.left}
        y={layout.top}
        width={layout.width}
        height={layout.height}
        rx={8}
        fill="var(--bg-inset)"
        stroke={selected ? "var(--select)" : stroke}
        strokeWidth={selected ? 2.5 : 1.6}
        style={{ cursor: "grab" }}
        onMouseDown={(e) => onBodyMouseDown(block, e)}
        onDoubleClick={() => onToggleCollapse(block.id)}
      />
      <rect x={layout.left} y={layout.top} width={layout.width} height={BLOCK_HEADER_HEIGHT - 4} rx={8} fill={`var(--block-${block.category}-fill)`} pointerEvents="none" />
      <text x={layout.cx} y={layout.top + 11} textAnchor="middle" fontSize={8.5} fontFamily="var(--font-mono)" fill={stroke} pointerEvents="none">
        {BLOCK_CATEGORY_LABELS[block.category].toUpperCase()}
      </text>
      <text x={layout.cx} y={layout.top + 22} textAnchor="middle" fontSize={10.5} fontWeight={600} fill="var(--text)" pointerEvents="none">
        {block.label.length > 22 ? `${block.label.slice(0, 21)}…` : block.label}
      </text>
      {block.params.map((param, i) => (
        <text
          key={param.id}
          x={layout.cx}
          y={layout.top + BLOCK_HEADER_HEIGHT + 8 + i * BLOCK_KNOB_LINE}
          textAnchor="middle"
          fontSize={9.5}
          fontFamily="var(--font-mono)"
          fill="var(--text-dim)"
          pointerEvents="none"
        >
          ◉ {param.label} {knobReadout(byId.get(param.partId), param.paramKey)}
        </text>
      ))}
      {layout.pins.map((pin) => {
        const pending = pendingTerminal?.partId === pin.port.terminal.partId && pendingTerminal.terminalId === pin.port.terminal.terminalId;
        const inward = pin.side === "left" ? 1 : pin.side === "right" ? -1 : 0;
        const labelX = pin.edgeX + inward * 5;
        const labelY = pin.side === "top" ? pin.edgeY + 10 : pin.side === "bottom" ? pin.edgeY - 4 : pin.edgeY + 3;
        return (
          <g key={pin.port.id} data-port-id={pin.port.id}>
            <text
              x={labelX}
              y={labelY}
              textAnchor={pin.side === "left" ? "start" : pin.side === "right" ? "end" : "middle"}
              fontSize={8.5}
              fontFamily="var(--font-mono)"
              fill="var(--text-dim)"
              pointerEvents="none"
            >
              {pin.port.label}
            </text>
            <circle
              cx={pin.x}
              cy={pin.y}
              r={4.5}
              fill={pending ? "var(--select)" : "var(--wire)"}
              style={{ cursor: "crosshair" }}
              onClick={(e) => onPinClick(pin.port.terminal, e)}
            >
              <title>{`${block.label} · ${pin.port.label}`}</title>
            </circle>
          </g>
        );
      })}
    </g>
  );
}
