import { DrcPanel } from "../DrcPanel";
import type { PartInstance, Wire } from "../types";
import type { WorkMode } from "./modes";

interface CircuitSummaryProps {
  parts: PartInstance[];
  wires: Wire[];
  blockCount: number;
  outputNode: string;
  onSelectPart: (id: string) => void;
  onModeChange: (mode: WorkMode) => void;
}

/**
 * The right panel when nothing is selected: is the circuit sound (the check), and where to go next
 * - so loading a preset is followed by an obvious next step instead of a blank inspector.
 */
export function CircuitSummary({ parts, wires, blockCount, outputNode, onSelectPart, onModeChange }: CircuitSummaryProps) {
  const physical = parts.filter((p) => p.type !== "ground").length;
  return (
    <div className="panel">
      <div className="panel-title">회로</div>
      <p className="summary-counts">
        부품 {physical}개 · 기능 블록 {blockCount}개 · 듣는 지점 {outputNode || "없음"}
      </p>
      <DrcPanel parts={parts} wires={wires} outputNode={outputNode} onSelectPart={onSelectPart} />
      <div className="summary-next">
        <span>다음 단계</span>
        <button type="button" onClick={() => onModeChange("play")}>
          <b>2</b> 연주하며 들어보기
        </button>
        <button type="button" onClick={() => onModeChange("analyze")}>
          <b>3</b> 자세히 분석
        </button>
        <button type="button" onClick={() => onModeChange("build")}>
          <b>4</b> 실제로 만들기
        </button>
      </div>
      <p className="canvas-hint">부품·배선·블록을 클릭하면 여기서 값을 바꿀 수 있습니다.</p>
    </div>
  );
}
