interface MonteCarloPanelProps {
  canRun: boolean;
  tolerancePercent: number;
  onTolerancePercentChange: (value: number) => void;
  worstCaseSpreadDb: number | null;
  onRun: () => void;
}

/** Component-tolerance Monte Carlo panel: sweeps AC response N times with every R/C/L perturbed by
 * +-tolerance%, overlays the resulting min/max band on the frequency response chart above it. */
export function MonteCarloPanel({ canRun, tolerancePercent, onTolerancePercentChange, worstCaseSpreadDb, onRun }: MonteCarloPanelProps) {
  return (
    <div className="panel">
      <div className="panel-title">부품 공차 분석 (몬테카를로, 20회)</div>
      <div className="field">
        <div className="field-row">
          <label>공차</label>
          <span className="field-value">±{tolerancePercent}%</span>
        </div>
        <input
          type="range"
          min={1}
          max={30}
          step={1}
          value={tolerancePercent}
          onChange={(e) => onTolerancePercentChange(Number(e.target.value))}
        />
      </div>
      <div className="run-row">
        <button type="button" onClick={onRun} disabled={!canRun}>
          공차 분석 실행
        </button>
      </div>
      {!canRun && <p className="canvas-hint">출력 노드를 선택해야 분석할 수 있습니다.</p>}
      {worstCaseSpreadDb !== null && (
        <p className="status-text">최대 편차: {worstCaseSpreadDb.toFixed(2)} dB (주파수 응답 그래프의 음영 영역 참고)</p>
      )}
    </div>
  );
}
