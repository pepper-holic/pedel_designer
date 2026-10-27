import { useCallback, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { snapToGrid, GRID_SIZE } from "./geometry";
import { useCanvasView } from "./useCanvasView";
import { CanvasPart } from "./CanvasPart";
import { CanvasBlockLayer } from "./CanvasBlockLayer";
import { CanvasWireLayer } from "./CanvasWireLayer";
import { CanvasProbeLayer } from "./CanvasProbeLayer";
import { CanvasBlockSymbol } from "./CanvasBlockSymbol";
import { buildCanvasEndpoints } from "./canvasEndpoints";
import { CanvasControls } from "./CanvasControls";
import type { ResolvedProbe } from "./probes";
import type { OperatingPoint } from "./operatingPoint";
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
  /** Probe mode: terminal and wire clicks place/remove a probe instead of drawing a wire. */
  probeMode?: boolean;
  onProbeModeChange?: (on: boolean) => void;
  onProbeTerminal?: (ref: TerminalRef) => void;
  probes?: ResolvedProbe[];
  /** partId:terminalId -> net, for placing DC voltage labels on nets. */
  terminalNet?: Map<string, string>;
  operatingPoint?: OperatingPoint | null;
  showDc?: boolean;
  onShowDcChange?: (on: boolean) => void;
  selectedBlockId?: string | null;
  /** Selects a whole block (its parts become the selection). */
  onSelectBlock?: (blockId: string) => void;
  onToggleCollapse?: (blockId: string) => void;
  onSetAllCollapsed?: (collapsed: boolean) => void;
  /** Live update of a wire's dragged corners (committed by `onDragEnd`). */
  onWireWaypoints?: (wireId: string, waypoints: { x: number; y: number }[]) => void;
  onAutoArrange?: () => void;
  /** Bump to auto-fit the view to the current parts - the editor changes this whenever the whole
   * circuit is replaced (template load, new circuit) so a freshly loaded preset arrives fully visible. */
  fitSignal?: number;
  /** Where the toolbar goes (the panel's header row); without one it floats over the canvas. */
  toolbarTarget?: HTMLElement | null;
  width?: number;
  height?: number;
}

const PAN_DRAG_THRESHOLD = 4;
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
  probeMode = false,
  onProbeModeChange,
  onProbeTerminal,
  probes = [],
  terminalNet,
  operatingPoint = null,
  showDc = false,
  onShowDcChange,
  selectedBlockId = null,
  onSelectBlock,
  onToggleCollapse,
  onSetAllCollapsed,
  onWireWaypoints,
  onAutoArrange,
  fitSignal = 0,
  toolbarTarget,
  width = 900,
  height = 460,
}: SchematicCanvasProps) {
  const [dragId, setDragId] = useState<string | null>(null);
  // Dragging one segment of the selected wire: which wire, which segment, and the corners it started from.
  const [segmentDrag, setSegmentDrag] = useState<{ wireId: string; segment: number; corners: { x: number; y: number }[] } | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [pendingTerminalState, setPendingTerminal] = useState<TerminalRef | null>(null);
  const [panStart, setPanStart] = useState<{ mouseX: number; mouseY: number; panX: number; panY: number; moved: boolean } | null>(null);
  // Shift+drag on the background draws a selection box instead of panning. Panning is the more
  // frequent gesture, so it keeps the unmodified drag.
  const [selectBox, setSelectBox] = useState<SelectionBox | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const justBoxSelected = useRef(false);
  const netOf = useCallback((ref: TerminalRef) => terminalNet?.get(`${ref.partId}:${ref.terminalId}`), [terminalNet]);
  const endpoints = useMemo(() => buildCanvasEndpoints(parts, blocks, terminalNet ? netOf : undefined), [parts, blocks, terminalNet, netOf]);
  const visibleParts = useMemo(() => parts.filter((p) => !endpoints.hidden.has(p.id)), [parts, endpoints]);

  // What fit should frame: visible parts plus collapsed blocks' boxes (a collapsed block's hidden
  // parts can span far more than its box).
  const fitBounds = useMemo(
    () => [
      ...visibleParts.map((p) => ({ minX: p.x - FIT_PART_MARGIN, minY: p.y - FIT_PART_MARGIN, maxX: p.x + FIT_PART_MARGIN, maxY: p.y + FIT_PART_MARGIN })),
      ...[...endpoints.layouts.values()].map((l) => ({ minX: l.left - 30, minY: l.top - 20, maxX: l.left + l.width + 30, maxY: l.top + l.height + 20 })),
    ],
    [visibleParts, endpoints],
  );
  const canvasView = useCanvasView(svgRef, fitBounds, { width, height }, fitSignal);
  const { view, setView, toWorld } = canvasView;

  const screenPoint = (e: React.MouseEvent<SVGSVGElement> | React.WheelEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handleBodyMouseDown = (part: PartInstance, e: React.MouseEvent) => {
    e.stopPropagation();
    const svg = (e.currentTarget as SVGElement).ownerSVGElement!;
    const rect = svg.getBoundingClientRect();
    const world = toWorld({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    setDragId(part.id);
    setDragOffset({ x: world.x - part.x, y: world.y - part.y });
    onSelectPart(part.id);
  };

  /** Grabbing a collapsed block selects it and drags it by one of its (hidden) parts - the editor
   * moves the whole selection together, so every member follows. */
  const handleBlockMouseDown = (block: BlockInstance, e: React.MouseEvent) => {
    e.stopPropagation();
    const anchor = parts.find((p) => p.blockId === block.id);
    if (!anchor) return;
    const svg = (e.currentTarget as SVGElement).ownerSVGElement!;
    const rect = svg.getBoundingClientRect();
    const world = toWorld({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    onSelectBlock?.(block.id);
    setDragId(anchor.id);
    setDragOffset({ x: world.x - anchor.x, y: world.y - anchor.y });
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
    if (segmentDrag) {
      const world = toWorld(screenPoint(e));
      const { segment, corners } = segmentDrag;
      const p = corners[segment];
      const q = corners[segment + 1];
      const next = corners.map((c) => ({ ...c }));
      // A horizontal segment moves up/down, a vertical one left/right - both of its corners together,
      // so the wire stays orthogonal.
      if (p.y === q.y) next[segment].y = next[segment + 1].y = snapToGrid(world.y);
      else next[segment].x = next[segment + 1].x = snapToGrid(world.x);
      onWireWaypoints?.(segmentDrag.wireId, next.slice(1, -1));
      return;
    }
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
    // The click that follows a rubber-band drag lands on the background too; without this it would
    // throw away the selection the drag just made.
    if (justBoxSelected.current) {
      justBoxSelected.current = false;
      return;
    }
    onSelectPart(null);
    onSelectWire?.(null);
  };

  /** Ends a rubber-band drag, reporting whatever it enclosed. */
  const finishBoxSelect = () => {
    if (!selectBox) return;
    // Visible parts by their own bodies; a collapsed block by its box (its parts are hidden, and
    // grabbing half of a block's members would make no sense).
    const ids = new Set(partsInBox(visibleParts, selectBox));
    const left = Math.min(selectBox.x1, selectBox.x2);
    const right = Math.max(selectBox.x1, selectBox.x2);
    const top = Math.min(selectBox.y1, selectBox.y2);
    const bottom = Math.max(selectBox.y1, selectBox.y2);
    for (const [blockId, l] of endpoints.layouts) {
      if (l.left + l.width < left || l.left > right || l.top + l.height < top || l.top > bottom) continue;
      for (const p of parts) if (p.blockId === blockId) ids.add(p.id);
    }
    onBoxSelect?.([...ids]);
    justBoxSelected.current = true;
    setSelectBox(null);
  };

  // A wire is drawn by clicking two terminals in sequence, so between those clicks the first one
  // is held as pending. If its part disappears in between - deleted, or the whole circuit replaced
  // by "새 회로"/a template - the half-finished wire has to be abandoned. Otherwise the next terminal
  // click completes it against a part that no longer exists, producing a wire that is in the circuit
  // data but never rendered (its endpoints can't be resolved), and so can be neither seen nor
  // deleted. Derived during render rather than cleared in an effect, so there is no frame in which
  // the stale terminal is still live.
  const pendingTerminal = pendingTerminalState && parts.some((p) => p.id === pendingTerminalState.partId) ? pendingTerminalState : null;

  const handleTerminalClick = (ref: TerminalRef, e: React.MouseEvent) => {
    e.stopPropagation();
    if (probeMode) {
      onProbeTerminal?.(ref);
      return;
    }
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

  const toolbar = (
    <CanvasControls
      zoom={view.zoom}
      onZoomIn={canvasView.zoomIn}
      onZoomOut={canvasView.zoomOut}
      onFit={canvasView.fit}
      onReset={canvasView.reset}
      onAutoArrange={onAutoArrange}
      probeMode={probeMode}
      onProbeModeChange={onProbeModeChange}
      showDc={showDc}
      onShowDcChange={onShowDcChange}
      blocksCollapsed={blocks.length > 0 && blocks.every((b) => b.collapsed)}
      onBlocksCollapsedChange={blocks.length > 0 ? onSetAllCollapsed : undefined}
    />
  );

  return (
    <div style={{ position: "relative" }}>
      {toolbarTarget ? createPortal(toolbar, toolbarTarget) : toolbar}
      <svg
        ref={svgRef}
        width={width}
        height={height}
        // The schematic is a graphic, and its content is only otherwise reachable by the inspector.
        // Naming it with a live count at least tells a screen-reader user what is on the canvas.
        role="img"
        aria-label={`회로도: 부품 ${parts.length}개, 배선 ${wires.length}개`}
        style={{ display: "block", cursor: dragId ? "grabbing" : panStart ? "grabbing" : probeMode ? "crosshair" : "default" }}
        onMouseMove={handleMouseMove}
        onMouseUp={() => {
          if (segmentDrag) {
            setSegmentDrag(null);
            onDragEnd?.();
          }
          finishBoxSelect();
          if (dragId) onDragEnd?.();
          setDragId(null);
          setPanStart(null);
        }}
        onMouseLeave={() => {
          if (segmentDrag) {
            setSegmentDrag(null);
            onDragEnd?.();
          }
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
          <CanvasBlockLayer
            parts={parts}
            blocks={blocks}
            selectedBlockId={selectedBlockId}
            onSelectBlock={(id) => onSelectBlock?.(id)}
            onToggleCollapse={(id) => onToggleCollapse?.(id)}
          />

          <CanvasWireLayer
            endpoints={endpoints}
            parts={parts}
            wires={wires}
            netOf={netOf}
            fast={dragId !== null || segmentDrag !== null}
            selectedWireId={selectedWireId}
            onWireClick={(wire) => (probeMode ? onProbeTerminal?.(wire.a) : onSelectWire?.(wire.id))}
            onSegmentMouseDown={onWireWaypoints ? (wire, corners, segment) => setSegmentDrag({ wireId: wire.id, segment, corners }) : undefined}
          />

          {[...endpoints.layouts].map(([blockId, layout]) => {
            const block = blocks.find((b) => b.id === blockId)!;
            return (
              <CanvasBlockSymbol
                key={blockId}
                block={block}
                layout={layout}
                parts={parts}
                selected={blockId === selectedBlockId}
                pendingTerminal={pendingTerminal}
                onBodyMouseDown={handleBlockMouseDown}
                onPinClick={handleTerminalClick}
                onToggleCollapse={(id) => onToggleCollapse?.(id)}
              />
            );
          })}

          {visibleParts.map((part) => (
            <CanvasPart
              key={part.id}
              part={part}
              isSelected={selectedPartIds ? selectedPartIds.includes(part.id) : part.id === selectedPartId}
              pendingTerminal={pendingTerminal}
              onBodyMouseDown={handleBodyMouseDown}
              onTerminalClick={handleTerminalClick}
            />
          ))}

          {(probes.length > 0 || showDc) && terminalNet && (
            <CanvasProbeLayer
              parts={parts}
              probes={probes}
              terminalNet={terminalNet}
              operatingPoint={operatingPoint}
              showAllDc={showDc}
              endpoints={endpoints}
            />
          )}

          {selectBox && (
            <rect
              x={Math.min(selectBox.x1, selectBox.x2)}
              y={Math.min(selectBox.y1, selectBox.y2)}
              width={Math.abs(selectBox.x2 - selectBox.x1)}
              height={Math.abs(selectBox.y2 - selectBox.y1)}
              fill="var(--select)"
              fillOpacity={0.1}
              stroke="var(--select)"
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
