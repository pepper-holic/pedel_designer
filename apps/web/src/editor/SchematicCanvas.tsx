import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { terminalPosition, computeWirePaths, zoomAroundPoint, fitView, GRID_SIZE } from "./geometry";
import { BLOCK_CATEGORY_LABELS } from "./blockDefs";
import { CanvasPart, PART_HALF_WIDTH, PART_HALF_HEIGHT } from "./CanvasPart";
import { partsInBox, type SelectionBox } from "./selection";
import type { BlockInstance, PartInstance, TerminalRef, Wire } from "./types";

interface SchematicCanvasProps {
  parts: PartInstance[];
  wires: Wire[];
  blocks?: BlockInstance[];
  selectedPartId: string | null;
  /** Every part in the current selection. Always contains `selectedPartId` when that is set - the
   * single id drives the inspector, the list drives move/copy/delete. */
  selectedPartIds?: string[];
  selectedWireId?: string | null;
  /** Rubber-band result: the ids the user just dragged a box around. */
  onBoxSelect?: (ids: string[]) => void;
  onMovePart: (id: string, x: number, y: number) => void;
  onSelectPart: (id: string | null) => void;
  onSelectWire?: (id: string | null) => void;
  onAddWire: (a: TerminalRef, b: TerminalRef) => void;
  onDragEnd?: () => void;
  /** Bump to auto-fit the view to the current parts - the editor changes this whenever the whole
   * circuit is replaced (template load, new circuit) so a freshly loaded preset arrives fully visible. */
  fitSignal?: number;
  width?: number;
  height?: number;
}

// Block regions hug their parts using the same margin as a part's own hit-box, so the tint lines up
// with the selection outline rather than floating at some other offset.
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
// Transparent click target width for wires - the visible stroke is only 2px, which is not a
// realistic mouse target on a dense schematic.
const WIRE_HITBOX_WIDTH = 12;
// Half-extent used when fitting: a little wider than the part hit-box so the id/value text labels
// drawn just outside it are inside the fitted view too.
const FIT_PART_MARGIN = 50;

/**
 * SVG schematic canvas: drag parts by their body, click two terminals in sequence to wire them
 * together, drag the empty background to pan, and scroll the wheel to zoom (centered on the cursor).
 */
export function SchematicCanvas({
  parts,
  wires,
  blocks = [],
  selectedPartId,
  selectedPartIds,
  selectedWireId = null,
  onBoxSelect,
  onMovePart,
  onSelectPart,
  onSelectWire,
  onAddWire,
  onDragEnd,
  fitSignal = 0,
  width = 900,
  height = 460,
}: SchematicCanvasProps) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [pendingTerminal, setPendingTerminal] = useState<TerminalRef | null>(null);
  const [view, setView] = useState({ zoom: 1, panX: 0, panY: 0 });
  const [panStart, setPanStart] = useState<{ mouseX: number; mouseY: number; panX: number; panY: number; moved: boolean } | null>(null);
  // Shift+drag on the background draws a selection box instead of panning. Panning is the more
  // frequent gesture, so it keeps the unmodified drag.
  const [selectBox, setSelectBox] = useState<SelectionBox | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Attached as a native (non-passive) listener rather than React's onWheel: React registers
  // wheel handlers as passive, which silently drops preventDefault() and lets the page scroll
  // underneath the zoom gesture instead of stopping it.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheelNative = (e: WheelEvent) => {
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      const p = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      setView((v) => zoomAroundPoint(v, p, factor, MIN_ZOOM, MAX_ZOOM));
    };
    svg.addEventListener("wheel", onWheelNative, { passive: false });
    return () => svg.removeEventListener("wheel", onWheelNative);
  }, []);

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
    if (e.shiftKey && onBoxSelect) {
      const world = toWorld(p);
      setSelectBox({ x1: world.x, y1: world.y, x2: world.x, y2: world.y });
      return;
    }
    setPanStart({ mouseX: p.x, mouseY: p.y, panX: view.panX, panY: view.panY, moved: false });
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (selectBox) {
      const world = toWorld(screenPoint(e));
      setSelectBox({ ...selectBox, x2: world.x, y2: world.y });
      return;
    }
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

  const handleBackgroundClick = () => {
    if (panStart?.moved) return; // just finished a pan-drag, not a deselect click
    onSelectPart(null);
    onSelectWire?.(null);
  };

  /** Ends a rubber-band drag, reporting whatever it enclosed. */
  const finishBoxSelect = () => {
    if (!selectBox) return;
    onBoxSelect?.(partsInBox(parts, selectBox));
    setSelectBox(null);
  };

  // A wire is drawn by clicking two terminals in sequence, so between those clicks the first one
  // lives in `pendingTerminal`. If its part disappears in between - deleted, or the whole circuit
  // replaced by "새 회로"/a template - the half-finished wire has to be abandoned. Otherwise the
  // next terminal click completes it against a part that no longer exists, producing a wire that
  // is in the circuit data but never rendered (its endpoints can't be resolved), and so can be
  // neither seen nor deleted.
  useEffect(() => {
    if (pendingTerminal && !parts.some((p) => p.id === pendingTerminal.partId)) setPendingTerminal(null);
  }, [parts, pendingTerminal]);

  const resetView = () => setView({ zoom: 1, panX: 0, panY: 0 });

  // Kept in a ref, and synced in an effect rather than during render, so the auto-fit effect below
  // can read the current parts without listing them as a dependency - it must fire when the circuit
  // is replaced, not on every drag. Declared above that effect so it has already run when it fires.
  const partsRef = useRef(parts);
  useEffect(() => {
    partsRef.current = parts;
  }, [parts]);

  // Reads parts through a ref so the auto-fit effect below depends only on the fit signal - it must
  // fire when the circuit is *replaced*, not on every part drag.
  const fitToContent = useCallback(() => {
    const bounds = partsRef.current.map((p) => ({
      minX: p.x - FIT_PART_MARGIN,
      minY: p.y - FIT_PART_MARGIN,
      maxX: p.x + FIT_PART_MARGIN,
      maxY: p.y + FIT_PART_MARGIN,
    }));
    setView(fitView(bounds, { width, height }, { minZoom: MIN_ZOOM }));
  }, [width, height]);

  useEffect(() => {
    fitToContent();
  }, [fitSignal, fitToContent]);

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
        <button type="button" onClick={fitToContent} title="회로 전체가 보이도록 확대/축소와 위치를 맞춥니다">
          화면 맞춤
        </button>
        <button type="button" onClick={resetView}>
          리셋
        </button>
      </div>
      <svg
        ref={svgRef}
        width={width}
        height={height}
        // The schematic is a graphic, and its content is only otherwise reachable by the inspector.
        // Naming it with a live count at least tells a screen-reader user what is on the canvas.
        role="img"
        aria-label={`회로도: 부품 ${parts.length}개, 배선 ${wires.length}개`}
        style={{ display: "block", cursor: dragId ? "grabbing" : panStart ? "grabbing" : "default" }}
        onMouseMove={handleMouseMove}
        onMouseUp={() => {
          finishBoxSelect();
          if (dragId) onDragEnd?.();
          setDragId(null);
          setPanStart(null);
        }}
        onMouseLeave={() => {
          finishBoxSelect();
          if (dragId) onDragEnd?.();
          setDragId(null);
          setPanStart(null);
        }}
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
            <path
              key={wire.id}
              d={path}
              stroke={wire.id === selectedWireId ? "var(--accent)" : "var(--wire)"}
              strokeWidth={wire.id === selectedWireId ? 3 : 2}
              fill="none"
              pointerEvents="none"
            />
          ))}

          {/* Transparent fat overlay per wire: a 2px stroke is far too thin to click reliably, so
              selection hit-testing runs against this instead. Drawn after the visible strokes but
              before the parts, so terminals (wiring) still win over wire selection where they overlap. */}
          {resolvedWires.map(({ wire, path }) => (
            <path
              key={`hit-${wire.id}`}
              data-wire-id={wire.id}
              d={path}
              stroke="transparent"
              strokeWidth={WIRE_HITBOX_WIDTH}
              fill="none"
              pointerEvents="stroke"
              style={{ cursor: "pointer" }}
              onClick={(e) => {
                e.stopPropagation();
                onSelectWire?.(wire.id);
              }}
            />
          ))}

          {junctionPoints.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={3.5} fill="var(--wire)" />
          ))}

          {parts.map((part) => (
            <CanvasPart
              key={part.id}
              part={part}
              isSelected={selectedPartIds ? selectedPartIds.includes(part.id) : part.id === selectedPartId}
              pendingTerminal={pendingTerminal}
              onBodyMouseDown={handleBodyMouseDown}
              onTerminalClick={handleTerminalClick}
            />
          ))}

          {selectBox && (
            <rect
              x={Math.min(selectBox.x1, selectBox.x2)}
              y={Math.min(selectBox.y1, selectBox.y2)}
              width={Math.abs(selectBox.x2 - selectBox.x1)}
              height={Math.abs(selectBox.y2 - selectBox.y1)}
              fill="var(--accent)"
              fillOpacity={0.1}
              stroke="var(--accent)"
              strokeWidth={1}
              strokeDasharray="4 3"
              pointerEvents="none"
            />
          )}
        </g>
      </svg>
    </div>
  );
}
