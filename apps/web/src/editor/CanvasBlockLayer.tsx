import { useMemo } from "react";
import { bboxOfParts } from "./blockGeometry";
import { terminalPosition } from "./geometry";
import type { BlockInstance, PartInstance } from "./types";

// Block regions hug their parts using the same margin as a part's own hit-box, so the boundary lines
// up with the selection outline rather than floating at some other offset.
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
 * Expanded blocks: a faint hairline boundary around the parts (no fill, no heavy chrome - the
 * circuit should read like a real schematic), a small italic label that selects the block (and
 * offers to collapse it), and a plain text tag on each port terminal so it is clear where the block
 * connects out. Drawn first so parts and wires sit on top; only the label takes clicks.
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
        const selected = block.id === selectedBlockId;
        return (
          <g key={block.id} data-block-id={block.id} data-collapsed="false">
            {/* A hairline boundary only - no fill, no heavy dashes - so an expanded block reads as a
                faint pencil annotation around real schematic symbols, not a UI card. */}
            <rect
              x={x}
              y={y}
              width={width}
              height={height}
              rx={2}
              fill="none"
              stroke={selected ? "var(--select)" : "var(--block-stroke)"}
              strokeWidth={selected ? 1.5 : 0.75}
              strokeDasharray={selected ? "none" : "1 4"}
              strokeLinecap="round"
              opacity={selected ? 1 : 0.6}
              pointerEvents="none"
            />
            <text
              x={x + 8}
              y={y + 11}
              fontSize={9}
              fontStyle="italic"
              fontFamily="var(--font-mono)"
              fill="var(--text-faint)"
              style={{ cursor: "pointer" }}
              onClick={(e) => {
                e.stopPropagation();
                onSelectBlock(block.id);
              }}
              onDoubleClick={() => onToggleCollapse(block.id)}
            >
              {block.label}
            </text>
            <g
              transform={`translate(${x + width - 16},${y + 2})`}
              style={{ cursor: "pointer" }}
              onClick={(e) => {
                e.stopPropagation();
                onToggleCollapse(block.id);
              }}
              role="button"
              aria-label={`${block.label} 블록 접기`}
            >
              <path d="M2 4 L6 8 L10 4" stroke="var(--text-faint)" strokeWidth={1.2} fill="none" opacity={0.7} />
            </g>
            {ports.map(({ port, at }) => (
              <text
                key={port.id}
                pointerEvents="none"
                x={at.x}
                y={at.y - 13}
                textAnchor="middle"
                fontSize={7.5}
                fontStyle="italic"
                fontFamily="var(--font-mono)"
                fill="var(--text-faint)"
              >
                {port.label}
              </text>
            ))}
          </g>
        );
      })}
    </>
  );
}
