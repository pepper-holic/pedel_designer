import { Icon } from "../ui/Icon";
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
            <Icon name="play" size={12} /> 결과 재생
          </button>
        )}
      </div>
      {chain.length === 0 && <p className="canvas-hint">체인이 비어 있습니다. 위에서 회로를 추가하세요.</p>}
      {/* The chain hands each stage's output waveform to the next as an ideal source, so it cannot
          show a later stage loading an earlier one. That is fine between buffered pedals and wrong
          between a passive guitar and a low-impedance input - see docs/plan-guitar-wiring.md §8. */}
      <p className="canvas-hint note">
        <Icon name="info" size={13} /> 체인은 각 단의 출력 파형을 다음 단의 이상적 입력으로 넘깁니다 — 뒷단이 앞단에 거는 부하는 반영되지 않습니다. 패시브
        기타와 첫 페달 사이처럼 로딩이 핵심인 구간은 체인 대신 <strong>같은 캔버스에 함께 배치</strong>하세요(넷리스트가 하나로 합쳐져 상호작용까지 계산됩니다).
        "기타 배선 → 신호 경로" 프리셋이 그 예입니다.
      </p>
      {status && <p className="status-text">{status}</p>}
    </div>
  );
}
