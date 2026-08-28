export interface ChainStageOption {
  id: string;
  name: string;
}

interface ChainPanelProps {
  options: ChainStageOption[];
  chain: string[];
  onAddStage: (id: string) => void;
  onRemoveStage: (index: number) => void;
  onMoveStage: (index: number, direction: -1 | 1) => void;
  canRun: boolean;
  onRun: () => void;
  status: string | null;
  hasResult: boolean;
  onPlayResult: () => void;
}

/** Chains multiple pedal circuits in series (current circuit and/or any library preset), each
 * stage's output feeding the next stage's input, and runs the uploaded sample through the chain. */
export function ChainPanel({ options, chain, onAddStage, onRemoveStage, onMoveStage, canRun, onRun, status, hasResult, onPlayResult }: ChainPanelProps) {
  return (
    <div className="panel">
      <div className="panel-title">페달 체인</div>
      <div className="field">
        <label>스테이지 추가</label>
        <select
          value=""
          onChange={(e) => {
            if (e.target.value) onAddStage(e.target.value);
          }}
          style={{ width: "100%" }}
        >
          <option value="" disabled>
            추가할 회로 선택...
          </option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </div>
      {chain.length > 0 && (
        <div className="template-list">
          {chain.map((id, i) => {
            const label = options.find((o) => o.id === id)?.name ?? id;
            return (
              <div key={`${id}-${i}`} className="template-card">
                <span className="template-name">
                  {i + 1}. {label}
                </span>
                <div className="run-row">
                  <button type="button" onClick={() => onMoveStage(i, -1)} disabled={i === 0}>
                    ↑
                  </button>
                  <button type="button" onClick={() => onMoveStage(i, 1)} disabled={i === chain.length - 1}>
                    ↓
                  </button>
                  <button type="button" onClick={() => onRemoveStage(i)}>
                    제거
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div className="run-row" style={{ marginTop: 10 }}>
        <button type="button" className="primary" onClick={onRun} disabled={!canRun}>
          체인 시뮬레이션 실행
        </button>
        {hasResult && (
          <button type="button" onClick={onPlayResult}>
            ▶ 결과 재생
          </button>
        )}
      </div>
      {chain.length === 0 && <p className="canvas-hint">체인이 비어 있습니다. 위에서 회로를 추가하세요.</p>}
      {status && <p className="status-text">{status}</p>}
    </div>
  );
}
