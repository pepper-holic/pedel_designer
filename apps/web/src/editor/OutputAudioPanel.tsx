interface OutputAudioPanelProps {
  outputNode: string;
  onOutputNodeChange: (node: string) => void;
  netNames: string[];
  inputGain: number;
  onInputGainChange: (gain: number) => void;
  hasSample: boolean;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  canRun: boolean;
  onRun: () => void;
  status: string;
}

export function OutputAudioPanel({
  outputNode,
  onOutputNodeChange,
  netNames,
  inputGain,
  onInputGainChange,
  hasSample,
  onFileChange,
  canRun,
  onRun,
  status,
}: OutputAudioPanelProps) {
  return (
    <div className="panel">
      <div className="panel-title">출력 노드 / 오디오</div>
      <div className="field">
        <label htmlFor="output-node-select">출력 노드</label>
        <select id="output-node-select" value={outputNode} onChange={(e) => onOutputNodeChange(e.target.value)}>
          <option value="">선택 안 함</option>
          {netNames
            .filter((n) => n !== "0")
            .map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
        </select>
      </div>
      <div className="field">
        <div className="field-row">
          <label htmlFor="input-gain-slider">입력 게인 (V)</label>
          <span className="field-value">{inputGain.toFixed(2)}</span>
        </div>
        <input
          id="input-gain-slider"
          type="range"
          min={0.01}
          max={5}
          step={0.01}
          value={inputGain}
          onChange={(e) => onInputGainChange(Number(e.target.value))}
        />
      </div>
      <input type="file" accept="audio/*" onChange={onFileChange} />
      {!hasSample && <p className="canvas-hint">오디오 파일을 먼저 선택해야 시뮬레이션을 실행할 수 있습니다.</p>}
      <div className="run-row">
        <button type="button" className="primary" onClick={onRun} disabled={!canRun}>
          시뮬레이션 실행
        </button>
      </div>
      {status && <p className="status-text">{status}</p>}
    </div>
  );
}
