import { useMemo } from "react";
import { BLOCK_CATEGORY_LABELS } from "./blockDefs";
import { PART_HALF_WIDTH, PART_HALF_HEIGHT } from "./CanvasPart";
import type { BlockInstance, PartInstance } from "./types";

// Block regions hug their parts using the same margin as a part's own hit-box, so the tint lines up
// with the selection outline rather than floating at some other offset.
const BLOCK_PADDING = 22;
/** Extra headroom above the topmost part so the block label never overlaps it. */
const LABEL_HEADROOM = 18;

interface BlockRegion {
  block: BlockInstance;
  x: number;
  y: number;
  width: number;
  height: number;
}

function computeBlockRegions(parts: PartInstance[], blocks: BlockInstance[]): BlockRegion[] {
  const regions: BlockRegion[] = [];
  for (const block of blocks) {
    const blockParts = parts.filter((p) => p.blockId === block.id);
    if (blockParts.length === 0) continue;
    const minX = Math.min(...blockParts.map((p) => p.x - PART_HALF_WIDTH));
    const maxX = Math.max(...blockParts.map((p) => p.x + PART_HALF_WIDTH));
    const minY = Math.min(...blockParts.map((p) => p.y - PART_HALF_HEIGHT));
    const maxY = Math.max(...blockParts.map((p) => p.y + PART_HALF_HEIGHT));
    regions.push({
      block,
      x: minX - BLOCK_PADDING,
      y: minY - BLOCK_PADDING - LABEL_HEADROOM,
      width: maxX - minX + BLOCK_PADDING * 2,
      height: maxY - minY + BLOCK_PADDING * 2 + LABEL_HEADROOM,
    });
  }
  return regions;
}

/** Tinted, dashed background region + label behind every expanded functional block. Drawn first so
 * parts and wires sit on top of it. */
export function CanvasBlockLayer({ parts, blocks }: { parts: PartInstance[]; blocks: BlockInstance[] }) {
  const regions = useMemo(() => computeBlockRegions(parts, blocks), [parts, blocks]);
  return (
    <>
      {regions.map(({ block, x, y, width, height }) => (
        <g key={block.id} pointerEvents="none">
          <rect
            x={x}
            y={y}
            width={width}
            height={height}
            rx={10}
            fill={`var(--block-${block.category}-fill)`}
            stroke={`var(--block-${block.category}-stroke)`}
            strokeWidth={1.2}
            strokeDasharray="5 4"
          />
          <text x={x + 8} y={y + 13} fontSize={10} fontFamily="var(--font-mono)" fill={`var(--block-${block.category}-stroke)`}>
            {BLOCK_CATEGORY_LABELS[block.category].toUpperCase()} · {block.label}
          </text>
        </g>
      ))}
    </>
  );
}
