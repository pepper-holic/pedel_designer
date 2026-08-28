import type { ThdResult } from "../core/analysis/thd";

interface ThdPanelProps {
  canMeasure: boolean;
  result: ThdResult | null;
  onMeasure: () => void;
}

/** THD measurement panel: drives the circuit with an internally synthesized 1kHz test tone
 * (independent of any user-uploaded sample) and reports the resulting harmonic distortion. */
export function ThdPanel({ canMeasure, result, onMeasure }: ThdPanelProps) {
  return (
    <div className="panel">
      <div className="panel-title">THD 측정 (1kHz 테스트 톤)</div>
      <div className="run-row">
        <button type="button" onClick={onMeasure} disabled={!canMeasure}>
          THD 측정 실행
        </button>
      </div>
      {!canMeasure && <p className="canvas-hint">출력 노드를 선택해야 측정할 수 있습니다.</p>}
      {result && (
        <>
          <p className="status-text">THD: {result.thdPercent.toFixed(3)}%</p>
          <p className="canvas-hint">
            {result.harmonics.map((h) => `${h.order}차: ${h.magnitude.toExponential(2)}`).join(" · ")}
          </p>
        </>
      )}
    </div>
  );
}
