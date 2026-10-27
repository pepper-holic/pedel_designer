interface CanvasControlsProps {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  onReset: () => void;
  probeMode: boolean;
  onProbeModeChange?: (on: boolean) => void;
  showDc: boolean;
  onShowDcChange?: (on: boolean) => void;
  /** Present when the circuit has blocks: collapses/expands all of them. */
  blocksCollapsed?: boolean;
  onBlocksCollapsedChange?: (collapsed: boolean) => void;
}

/** The control strip floating over the canvas: zoom, fit/reset, and the probe/DC view toggles. */
export function CanvasControls({
  zoom,
  onZoomIn,
  onZoomOut,
  onFit,
  onReset,
  probeMode,
  onProbeModeChange,
  showDc,
  onShowDcChange,
  blocksCollapsed,
  onBlocksCollapsedChange,
}: CanvasControlsProps) {
  return (
    <div className="canvas-zoom-controls">
      <button type="button" onClick={onZoomIn}>
        +
      </button>
      <span>{Math.round(zoom * 100)}%</span>
      <button type="button" onClick={onZoomOut}>
        −
      </button>
      <button type="button" className="canvas-tool-toggle" onClick={onFit} title="회로 전체가 보이도록 확대/축소와 위치를 맞춥니다">
        화면 맞춤
      </button>
      <button type="button" className="canvas-tool-toggle" onClick={onReset}>
        리셋
      </button>
      {onProbeModeChange && (
        <button
          type="button"
          className="canvas-tool-toggle"
          aria-pressed={probeMode}
          onClick={() => onProbeModeChange(!probeMode)}
          title="켜면 단자나 배선을 클릭해 측정 지점(프로브)을 찍습니다. 같은 노드를 다시 클릭하면 지워집니다. 단축키 P"
        >
          프로브
        </button>
      )}
      {onBlocksCollapsedChange && (
        <button
          type="button"
          className="canvas-tool-toggle"
          aria-pressed={blocksCollapsed}
          onClick={() => onBlocksCollapsedChange(!blocksCollapsed)}
          title="모든 기능 블록을 블랙박스(핀 달린 상자)로 접거나, 세부 회로로 펼칩니다"
        >
          블랙박스 보기
        </button>
      )}
      {onShowDcChange && (
        <button
          type="button"
          className="canvas-tool-toggle"
          aria-pressed={showDc}
          onClick={() => onShowDcChange(!showDc)}
          title="신호가 없을 때 각 노드의 DC 바이어스 전압을 회로도 위에 표시합니다"
        >
          DC 전압
        </button>
      )}
    </div>
  );
}
