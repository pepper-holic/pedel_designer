import { useMemo } from "react";
import { BLOCK_CATEGORY_LABELS } from "./blocks";
import { bboxOfParts } from "./blockGeometry";
import { terminalPosition } from "./geometry";
import type { BlockInstance, PartInstance } from "./types";

// Block regions hug their parts using the same margin as a part's own hit-box, so the tint lines up
// with the selection outline rather than floating at some other offset.
const BLOCK_PADDING = 22;
/** Extra headroom above the topmost part so the block label never overlaps it. */
const LABEL_HEADROOM = 18;

interface CanvasBlockLayerProps {
  parts: PartInstance[];
  blocks: BlockInstance[];
  selectedBlockId: string | null;
  onSelectBlock: (blockId: string) => void;
  onToggleCollapse: (blockId: string) => void;
}

/**
 * Expanded blocks: a tinted region behind the parts, a header that selects the block (and offers to
 * collapse it), and a small tag on each port terminal so it is clear where the block connects out.
 * Drawn first so parts and wires sit on top; only the header takes clicks.
 */
export function CanvasBlockLayer({ parts, blocks, selectedBlockId, onSelectBlock, onToggleCollapse }: CanvasBlockLayerProps) {
  const regions = useMemo(
    () =>
      blocks
        .filter((b) => !b.collapsed)
        .flatMap((block) => {
          const members = parts.filter((p) => p.blockId === block.id);
          const box = bboxOfParts(members);
          if (!box) return [];
          const byId = new Map(members.map((p) => [p.id, p]));
          const ports = block.ports.flatMap((port) => {
            const part = byId.get(port.terminal.partId);
            return part ? [{ port, at: terminalPosition(part, port.terminal.terminalId) }] : [];
          });
          return [
            {
              block,
              ports,
              x: box.minX - BLOCK_PADDING,
              y: box.minY - BLOCK_PADDING - LABEL_HEADROOM,
              width: box.maxX - box.minX + BLOCK_PADDING * 2,
              height: box.maxY - box.minY + BLOCK_PADDING * 2 + LABEL_HEADROOM,
            },
          ];
        }),
    [parts, blocks],
  );

  return (
    <>
      {regions.map(({ block, ports, x, y, width, height }) => {
        const stroke = `var(--block-${block.category}-stroke)`;
        const selected = block.id === selectedBlockId;
        const title = `${BLOCK_CATEGORY_LABELS[block.category].toUpperCase()} · ${block.label}`;
        return (
          <g key={block.id} data-block-id={block.id} data-collapsed="false">
            <rect
              x={x}
              y={y}
              width={width}
              height={height}
              rx={2}
              fill={`var(--block-${block.category}-fill)`}
              stroke={selected ? "var(--select)" : stroke}
              strokeWidth={selected ? 2 : 1.2}
              strokeDasharray="5 4"
              pointerEvents="none"
            />
            <text
              x={x + 8}
              y={y + 13}
              fontSize={10}
              fontFamily="var(--font-mono)"
              fill={stroke}
              style={{ cursor: "pointer" }}
              onClick={(e) => {
                e.stopPropagation();
                onSelectBlock(block.id);
              }}
              onDoubleClick={() => onToggleCollapse(block.id)}
            >
              {title}
            </text>
            <g
              transform={`translate(${x + width - 20},${y + 4})`}
              style={{ cursor: "pointer" }}
              onClick={(e) => {
                e.stopPropagation();
                onToggleCollapse(block.id);
              }}
              role="button"
              aria-label={`${block.label} 블록 접기`}
            >
              <rect width={14} height={12} rx={2} fill="var(--bg-inset)" stroke={stroke} strokeWidth={0.8} />
              <path d="M3 4 L7 8 L11 4" stroke={stroke} strokeWidth={1.4} fill="none" />
            </g>
            {ports.map(({ port, at }) => (
              <g key={port.id} pointerEvents="none" transform={`translate(${at.x},${at.y})`}>
                <rect x={-12} y={-20} width={24} height={10} rx={2} fill={stroke} opacity={0.85} />
                <text y={-12.5} textAnchor="middle" fontSize={7.5} fontFamily="var(--font-mono)" fill="#fff">
                  {port.label}
                </text>
              </g>
            ))}
          </g>
        );
      })}
    </>
  );
}
