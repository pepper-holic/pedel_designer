import { TEST_SIGNALS } from "../audio/testSignals";

interface OutputAudioPanelProps {
  outputNode: string;
  onOutputNodeChange: (node: string) => void;
  netNames: string[];
  inputGain: number;
  onInputGainChange: (gain: number) => void;
  hasSample: boolean;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onUseTestSignal: (id: string) => void;
  useTrapezoidal: boolean;
  onUseTrapezoidalChange: (value: boolean) => void;
  canRun: boolean;
  onRun: () => void;
  status: string;
  /** Knob preview: re-simulate and play a short clip whenever a value is changed. */
  preview?: { enabled: boolean; onEnabledChange: (on: boolean) => void; busy: boolean };
  /** Real-time playback: the circuit runs live and every edit is heard as it happens. */
  realtime?: RealtimeControl;
}

export interface RealtimeControl {
  supported: boolean;
  active: boolean;
  stats: { load: number; level: number; nonConvergent: number } | null;
  onToggle: () => void;
}

export function OutputAudioPanel({
  outputNode,
  onOutputNodeChange,
  netNames,
  inputGain,
  onInputGainChange,
  hasSample,
  onFileChange,
  onUseTestSignal,
  useTrapezoidal,
  onUseTrapezoidalChange,
  canRun,
  onRun,
  status,
  preview,
  realtime,
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
      <div className="field">
        <div className="field-row">
          <label>내장 테스트 신호</label>
        </div>
        <div className="test-signal-buttons">
          {TEST_SIGNALS.map((signal) => (
            <button key={signal.id} type="button" onClick={() => onUseTestSignal(signal.id)} title={signal.hint}>
              {signal.label}
            </button>
          ))}
        </div>
      </div>
      <div className="field-row">
        <label>
          <input type="checkbox" checked={useTrapezoidal} onChange={(e) => onUseTrapezoidalChange(e.target.checked)} />{" "}
          정확한 적분(trapezoidal) 사용
        </label>
        <span
          className="info-tip"
          title="기본값은 어떤 회로에도 안정적인 backward Euler입니다. 이 옵션을 켜면 특히 고음역대에서 더 정확한 결과를 주지만, 피드백이 강한 일부 회로에서는 진동이 생길 수 있습니다."
        >
          ⓘ
        </span>
      </div>
      <input type="file" accept="audio/*" onChange={onFileChange} />
      {!hasSample && <p className="canvas-hint">위 버튼으로 내장 신호를 고르거나 오디오 파일을 선택하면 시뮬레이션을 실행할 수 있습니다.</p>}
      <div className="run-row">
        <button type="button" className="primary" onClick={onRun} disabled={!canRun}>
          시뮬레이션 실행
        </button>
      </div>
      {realtime && <RealtimeRow realtime={realtime} />}
      {preview && (
        <div className="field-row" style={{ marginTop: 8 }}>
          <label>
            <input type="checkbox" checked={preview.enabled} onChange={(e) => preview.onEnabledChange(e.target.checked)} /> 노브 미리듣기
            {preview.busy ? " (계산 중...)" : ""}
          </label>
          <span
            className="info-tip"
            title="노브·부품값·입력 게인을 바꾸고 손을 떼면, 출력 노드의 소리를 0.6초 동안 바로 들려줍니다. 불러온 오디오가 있으면 그 앞부분을, 없으면 내장 코드 신호를 씁니다."
          >
            ⓘ
          </span>
        </div>
      )}
      {/* Simulation progress and failures arrive asynchronously, so they have to be announced. */}
      <p className="status-text" role="status" aria-live="polite">
        {status}
      </p>
    </div>
  );
}

function RealtimeRow({ realtime }: { realtime: RealtimeControl }) {
  const { supported, active, stats, onToggle } = realtime;
  const load = stats ? Math.round(stats.load * 100) : null;
  return (
    <div className="realtime-row">
      <button type="button" className={active ? "primary" : ""} onClick={onToggle} disabled={!supported} aria-pressed={active}>
        {active ? "■ 실시간 정지" : "▶ 실시간 재생"}
      </button>
      {active && load !== null && (
        <span className={`realtime-load${stats!.load > 0.8 ? " realtime-load-high" : ""}`} title="회로 계산에 드는 시간 / 재생 시간. 100%를 넘으면 소리가 끊깁니다.">
          부하 {load}%
        </span>
      )}
      {active && stats && stats.nonConvergent > 0 && <span className="realtime-warn">수렴 실패 {stats.nonConvergent}</span>}
      <span
        className="info-tip"
        title={
          supported
            ? "회로를 브라우저 오디오 스레드에서 직접 돌립니다. 선택한 신호(없으면 내장 코드)를 반복 재생하고, 노브·값을 바꾸면 그 즉시 소리가 바뀝니다. 음량은 자동으로 맞춥니다."
            : "이 브라우저는 AudioWorklet을 지원하지 않아 실시간 재생을 쓸 수 없습니다. 노브 미리듣기를 사용하세요."
        }
      >
        ⓘ
      </span>
    </div>
  );
}
