import { useMemo, useState } from "react";
import { PART_DEFS } from "./partDefs";
import { PartSymbol } from "./symbols";
import { terminalPosition, computeWirePaths, zoomAroundPoint, GRID_SIZE } from "./geometry";
import { BLOCK_CATEGORY_LABELS } from "./blockDefs";
import { partValueLabel } from "./valueLabel";
import type { BlockInstance, PartInstance, TerminalRef, Wire } from "./types";

interface SchematicCanvasProps {
  parts: PartInstance[];
  wires: Wire[];
  blocks?: BlockInstance[];
  selectedPartId: string | null;
  onMovePart: (id: string, x: number, y: number) => void;
  onSelectPart: (id: string | null) => void;
  onAddWire: (a: TerminalRef, b: TerminalRef) => void;
  onDragEnd?: () => void;
  width?: number;
  height?: number;
}

// Half-width/height of the invisible hit-box drawn around every part body (see the `<rect>` in the
// parts loop below) - reused here so a block's tinted region hugs its parts with the same margin
// used for the single-part selection outline.
const PART_HALF_WIDTH = 40;
const PART_HALF_HEIGHT = 38;
const BLOCK_PADDING = 22;

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
      y: minY - BLOCK_PADDING - 18, // extra headroom above so the label doesn't overlap the topmost part
      width: maxX - minX + BLOCK_PADDING * 2,
      height: maxY - minY + BLOCK_PADDING * 2 + 18,
    });
  }
  return regions;
}

function terminalKey(ref: TerminalRef): string {
  return `${ref.partId}:${ref.terminalId}`;
}

const MIN_ZOOM = 0.3;
const MAX_ZOOM = 3;
const PAN_DRAG_THRESHOLD = 4;

/**
 * SVG schematic canvas: drag parts by their body, click two terminals in sequence to wire them
 * together, drag the empty background to pan, and scroll the wheel to zoom (centered on the cursor).
 */
export function SchematicCanvas({
  parts,
  wires,
  blocks = [],
  selectedPartId,
  onMovePart,
  onSelectPart,
  onAddWire,
  onDragEnd,
  width = 900,
  height = 460,
}: SchematicCanvasProps) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [pendingTerminal, setPendingTerminal] = useState<TerminalRef | null>(null);
  const [view, setView] = useState({ zoom: 1, panX: 0, panY: 0 });
  const [panStart, setPanStart] = useState<{ mouseX: number; mouseY: number; panX: number; panY: number; moved: boolean } | null>(null);

  const screenPoint = (e: React.MouseEvent<SVGSVGElement> | React.WheelEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  /** Converts a screen-space point (relative to the SVG's bounding box) into world (pre-zoom/pan) coordinates. */
  const toWorld = (screen: { x: number; y: number }) => ({ x: (screen.x - view.panX) / view.zoom, y: (screen.y - view.panY) / view.zoom });

  const handleBodyMouseDown = (part: PartInstance, e: React.MouseEvent) => {
    e.stopPropagation();
    const svg = (e.currentTarget as SVGElement).ownerSVGElement!;
    const rect = svg.getBoundingClientRect();
    const world = toWorld({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    setDragId(part.id);
    setDragOffset({ x: world.x - part.x, y: world.y - part.y });
    onSelectPart(part.id);
  };

  const handleBackgroundMouseDown = (e: React.MouseEvent<SVGRectElement>) => {
    const p = screenPoint(e as unknown as React.MouseEvent<SVGSVGElement>);
    setPanStart({ mouseX: p.x, mouseY: p.y, panX: view.panX, panY: view.panY, moved: false });
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (dragId) {
      const world = toWorld(screenPoint(e));
      onMovePart(dragId, world.x - dragOffset.x, world.y - dragOffset.y);
      return;
    }
    if (panStart) {
      const p = screenPoint(e);
      const dx = p.x - panStart.mouseX;
      const dy = p.y - panStart.mouseY;
      const moved = panStart.moved || Math.hypot(dx, dy) > PAN_DRAG_THRESHOLD;
      setPanStart({ ...panStart, moved });
      setView((v) => ({ ...v, panX: panStart.panX + dx, panY: panStart.panY + dy }));
    }
  };

  const handleWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const p = screenPoint(e);
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    setView((v) => zoomAroundPoint(v, p, factor, MIN_ZOOM, MAX_ZOOM));
  };

  const handleBackgroundClick = () => {
    if (panStart?.moved) return; // just finished a pan-drag, not a deselect click
    onSelectPart(null);
  };

  const resetView = () => setView({ zoom: 1, panX: 0, panY: 0 });

  const handleTerminalClick = (ref: TerminalRef, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!pendingTerminal) {
      setPendingTerminal(ref);
      return;
    }
    if (pendingTerminal.partId === ref.partId && pendingTerminal.terminalId === ref.terminalId) {
      setPendingTerminal(null);
      return;
    }
    onAddWire(pendingTerminal, ref);
    setPendingTerminal(null);
  };

  // A junction dot is drawn wherever 3+ wire ends meet at the same terminal - a real electrical
  // junction, as opposed to a plain 2-wire pass-through or two wires merely crossing visually.
  const junctionPoints = useMemo(() => {
    const counts = new Map<string, number>();
    for (const wire of wires) {
      counts.set(terminalKey(wire.a), (counts.get(terminalKey(wire.a)) ?? 0) + 1);
      counts.set(terminalKey(wire.b), (counts.get(terminalKey(wire.b)) ?? 0) + 1);
    }
    const points: { x: number; y: number }[] = [];
    for (const [key, count] of counts) {
      if (count < 3) continue;
      const [partId, terminalId] = key.split(":");
      const part = parts.find((p) => p.id === partId);
      if (part) points.push(terminalPosition(part, terminalId));
    }
    return points;
  }, [wires, parts]);

  // Resolved (wire, endpoints) pairs for wires whose parts still exist, plus the crossing-aware
  // path string for each - computed together in one pass so a hop on one wire accounts for every
  // other wire currently on the canvas.
  const resolvedWires = useMemo(() => {
    const withEndpoints = wires
      .map((wire) => {
        const partA = parts.find((p) => p.id === wire.a.partId);
        const partB = parts.find((p) => p.id === wire.b.partId);
        if (!partA || !partB) return null;
        return { wire, a: terminalPosition(partA, wire.a.terminalId), b: terminalPosition(partB, wire.b.terminalId) };
      })
      .filter((w): w is { wire: Wire; a: { x: number; y: number }; b: { x: number; y: number } } => w !== null);

    const paths = computeWirePaths(withEndpoints.map((w) => [w.a, w.b]));
    return withEndpoints.map((w, i) => ({ wire: w.wire, path: paths[i] }));
  }, [wires, parts]);

  const blockRegions = useMemo(() => computeBlockRegions(parts, blocks), [parts, blocks]);

  return (
    <div style={{ position: "relative" }}>
      <div className="canvas-zoom-controls">
        <button type="button" onClick={() => setView((v) => ({ ...v, zoom: Math.min(MAX_ZOOM, v.zoom * 1.2) }))}>
          +
        </button>
        <span>{Math.round(view.zoom * 100)}%</span>
        <button type="button" onClick={() => setView((v) => ({ ...v, zoom: Math.max(MIN_ZOOM, v.zoom / 1.2) }))}>
          −
        </button>
        <button type="button" onClick={resetView}>
          리셋
        </button>
      </div>
      <svg
        width={width}
        height={height}
        style={{ display: "block", cursor: dragId ? "grabbing" : panStart ? "grabbing" : "default" }}
        onMouseMove={handleMouseMove}
        onMouseUp={() => {
          if (dragId) onDragEnd?.();
          setDragId(null);
          setPanStart(null);
        }}
        onMouseLeave={() => {
          if (dragId) onDragEnd?.();
          setDragId(null);
          setPanStart(null);
        }}
        onWheel={handleWheel}
      >
        <defs>
          <pattern
            id="schematic-grid"
            width={GRID_SIZE}
            height={GRID_SIZE}
            patternUnits="userSpaceOnUse"
            patternTransform={`translate(${view.panX},${view.panY}) scale(${view.zoom})`}
          >
            <circle cx={GRID_SIZE / 2} cy={GRID_SIZE / 2} r={1} fill="var(--grid-dot)" />
          </pattern>
        </defs>
        <rect width={width} height={height} fill="var(--bg-inset)" onMouseDown={handleBackgroundMouseDown} onClick={handleBackgroundClick} />
        <rect width={width} height={height} fill="url(#schematic-grid)" pointerEvents="none" />

        <g transform={`translate(${view.panX},${view.panY}) scale(${view.zoom})`}>
          {blockRegions.map(({ block, x, y, width: w, height: h }) => (
            <g key={block.id} pointerEvents="none">
              <rect
                x={x}
                y={y}
                width={w}
                height={h}
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

          {resolvedWires.map(({ wire, path }) => (
            <path key={wire.id} d={path} stroke="var(--wire)" strokeWidth={2} fill="none" />
          ))}

          {junctionPoints.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={3.5} fill="var(--wire)" />
          ))}

          {parts.map((part) => {
            const def = PART_DEFS[part.type];
            const isSelected = part.id === selectedPartId;
            const valueLabel = partValueLabel(part);
            return (
              // Rotation is scoped to an inner group (symbol + terminals only) rather than this
              // outer one, so the id/value text stays upright and stays put on screen instead of
              // flipping upside-down (and sliding to the opposite side) whenever a part is rotated
              // 180 - which auto-layout now does routinely for antiparallel diode pairs.
              <g key={part.id} transform={`translate(${part.x},${part.y})`}>
                {isSelected && (
                  <rect x={-40} y={-38} width={80} height={76} rx={6} fill="none" stroke="var(--accent)" strokeWidth={1.2} strokeDasharray="3 2" />
                )}
                <rect
                  x={-40}
                  y={-38}
                  width={80}
                  height={76}
                  fill="transparent"
                  onMouseDown={(e) => handleBodyMouseDown(part, e)}
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
                      onClick={(e) => handleTerminalClick({ partId: part.id, terminalId: t.id }, e)}
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
          })}
        </g>
      </svg>
    </div>
  );
}
