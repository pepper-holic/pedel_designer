import { useEffect, useRef, useState, type ReactNode } from "react";
import { SchematicCanvas } from "./SchematicCanvas";
import type { BlockInstance, PartInstance, TerminalRef, Wire } from "./types";
import type { ResolvedProbe } from "./probes";
import type { OperatingPoint } from "./operatingPoint";

interface EditorCanvasAreaProps {
  parts: PartInstance[];
  wires: Wire[];
  blocks: BlockInstance[];
  /** Bumped to re-fit the view to the circuit (replaced circuit, newly placed block). */
  fitSignal: number;
  selectedPartId: string | null;
  selectedPartIds: string[];
  selectedWireId: string | null;
  onBoxSelect: (ids: string[]) => void;
  /** Bumped whenever the whole circuit is replaced - brings the canvas into view. */
  circuitVersion: number;
  /** Shown over the canvas (the start cards on an empty circuit). */
  overlay?: ReactNode;
  /** Right end of the panel's title row. */
  headerExtra?: ReactNode;
  onMovePart: (id: string, x: number, y: number) => void;
  onSelectPart: (id: string | null) => void;
  onSelectWire: (id: string | null) => void;
  onAddWire: (a: TerminalRef, b: TerminalRef) => void;
  onDragEnd: () => void;
  probeMode: boolean;
  onProbeModeChange: (on: boolean) => void;
  onProbeTerminal: (ref: TerminalRef) => void;
  probes: ResolvedProbe[];
  terminalNet: Map<string, string>;
  operatingPoint: OperatingPoint | null;
  showDc: boolean;
  onShowDcChange: (on: boolean) => void;
  selectedBlockId: string | null;
  onSelectBlock: (blockId: string) => void;
  onToggleCollapse: (blockId: string) => void;
  onSetAllCollapsed: (collapsed: boolean) => void;
  onWireWaypoints: (wireId: string, waypoints: { x: number; y: number }[]) => void;
  onAutoArrange: () => void;
}

/** The schematic panel: title row, then the canvas filling whatever room the workspace gives it. */
const FALLBACK_SIZE = { width: 900, height: 460 };

export function EditorCanvasArea(props: EditorCanvasAreaProps) {
  const areaRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  // The canvas is exactly the size of its visible frame; zoom and pan reach the rest. (It used to
  // grow with the circuit inside a scrolling frame, so "fit to view" fitted the circuit to an SVG
  // larger than the screen and parts could sit in scrolled-away space.)
  const [size, setSize] = useState(FALLBACK_SIZE);
  // The header slot the canvas toolbar is portalled into (a state, so the canvas re-renders once it exists).
  const [toolbarSlot, setToolbarSlot] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 50 && height > 50) setSize({ width: Math.floor(width), height: Math.floor(height) });
    });
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  // On a narrow screen the three panes stack, and the canvas can sit below the fold - so loading a
  // preset changes nothing the user can see. `block: "nearest"` makes this a no-op on a wide screen
  // where the canvas is already in view.
  useEffect(() => {
    // Optional-called: jsdom (and any non-browser host) has no scrollIntoView.
    areaRef.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, [props.circuitVersion]);

  return (
    <div className="panel canvas-stage" ref={areaRef}>
      <div className="panel-head">
        <div className="panel-title">회로도</div>
        <div className="panel-head-tools" ref={setToolbarSlot} />
        {props.headerExtra}
      </div>
      <div className="canvas-frame canvas-frame-scroll" ref={frameRef}>
        <SchematicCanvas
          parts={props.parts}
          wires={props.wires}
          blocks={props.blocks}
          width={size.width}
          height={size.height}
          selectedPartId={props.selectedPartId}
          selectedPartIds={props.selectedPartIds}
          selectedWireId={props.selectedWireId}
          onBoxSelect={props.onBoxSelect}
          onMovePart={props.onMovePart}
          onSelectPart={props.onSelectPart}
          onSelectWire={props.onSelectWire}
          onAddWire={props.onAddWire}
          onDragEnd={props.onDragEnd}
          probeMode={props.probeMode}
          onProbeModeChange={props.onProbeModeChange}
          onProbeTerminal={props.onProbeTerminal}
          probes={props.probes}
          terminalNet={props.terminalNet}
          operatingPoint={props.operatingPoint}
          showDc={props.showDc}
          onShowDcChange={props.onShowDcChange}
          selectedBlockId={props.selectedBlockId}
          onSelectBlock={props.onSelectBlock}
          onToggleCollapse={props.onToggleCollapse}
          onSetAllCollapsed={props.onSetAllCollapsed}
          onWireWaypoints={props.onWireWaypoints}
          onAutoArrange={props.onAutoArrange}
          fitSignal={props.fitSignal}
          toolbarTarget={toolbarSlot}
        />
        {props.overlay}
      </div>
    </div>
  );
}
