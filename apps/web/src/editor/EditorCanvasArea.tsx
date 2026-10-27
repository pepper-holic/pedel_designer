import { useEffect, useRef, useState } from "react";
import { SchematicCanvas } from "./SchematicCanvas";
import { BottomDock } from "./BottomDock";
import type { DockTab } from "./dockTabs";
import type { BlockInstance, PartInstance, TerminalRef, Wire } from "./types";
import type { ResolvedProbe } from "./probes";
import type { OperatingPoint } from "./operatingPoint";

const EMPTY_CIRCUIT_TIP =
  '처음이신가요? "템플릿/블록" 탭에서 완성된 회로를 하나 불러온 뒤, 아래 "파형" 탭에서 오디오 파일을 넣고 ' +
  '"시뮬레이션 실행"을 눌러보세요. THD는 소리가 얼마나 찌그러지는지, 부품 공차는 실제 부품값 오차가 소리에 얼마나 ' +
  "영향을 주는지 보여주는 분석 도구입니다.";

const CANVAS_HINT =
  "R: 회전 · Delete: 삭제 · Ctrl+C/V/D: 복사·붙여넣기·복제 · 방향키: 이동(Shift로 크게) · [ ]: 부품 순환 · Esc: 선택 해제 · " +
  "휠: 확대/축소 · 빈 배경 드래그: 화면 이동 · Shift+드래그: 범위 선택 · 부품 드래그: 이동 · 단자 클릭 2회: 배선 · 배선 클릭: 선택 · P: 프로브 모드 · Ctrl+G: 블록으로 묶기 · 블록 더블클릭: 접기/펼치기";

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
  /** Bumped whenever the whole circuit is replaced - re-fits the view and resets the dock. */
  circuitVersion: number;
  dockTabs: DockTab[];
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
}

/** Centre column: the schematic itself with the analysis dock underneath. */
const FALLBACK_SIZE = { width: 900, height: 460 };

export function EditorCanvasArea(props: EditorCanvasAreaProps) {
  const areaRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  // The canvas is exactly the size of its visible frame; zoom and pan reach the rest. (It used to
  // grow with the circuit inside a scrolling frame, so "fit to view" fitted the circuit to an SVG
  // larger than the screen and parts could sit in scrolled-away space.)
  const [size, setSize] = useState(FALLBACK_SIZE);
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
    <div className="canvas-area" ref={areaRef}>
      <div className="panel canvas-stage">
        <div className="panel-title">회로도</div>
        {props.parts.length === 0 ? (
          <p className="preset-description">
            회로가 비어 있습니다. 왼쪽 "소자 팔레트"에서 부품을 추가하거나, "템플릿" 탭에서 예제 회로를 불러와 시작하세요.
            <span className="info-tip" title={EMPTY_CIRCUIT_TIP}>
              ⓘ
            </span>
          </p>
        ) : (
          <p className="canvas-hint">{CANVAS_HINT}</p>
        )}
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
            fitSignal={props.fitSignal}
          />
        </div>
      </div>

      <BottomDock key={props.circuitVersion} tabs={props.dockTabs} />
    </div>
  );
}
