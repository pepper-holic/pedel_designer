import { useRef } from "react";
import { TEST_SIGNALS } from "../../audio/testSignals";
import { CABINET_VARIANTS, type CabinetVariant } from "../../audio/cabinetIr";

export interface RealtimeControl {
  supported: boolean;
  active: boolean;
  stats: { load: number; level: number; nonConvergent: number } | null;
  onToggle: () => void;
}

interface TransportBarProps {
  /** What is feeding the circuit now, if anything. */
  source: { kind: "signal" | "file"; id: string; label: string } | null;
  onUseTestSignal: (id: string) => void;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  inputGain: number;
  onInputGainChange: (gain: number) => void;
  realtime: RealtimeControl;
  preview: { enabled: boolean; onEnabledChange: (on: boolean) => void; busy: boolean };
  outputNode: string;
  onOutputNodeChange: (node: string) => void;
  netNames: string[];
  cabinet: { enabled: boolean; variant: CabinetVariant; onEnabledChange: (on: boolean) => void; onVariantChange: (v: CabinetVariant) => void };
  status: string;
}

const FILE_OPTION = "__file__";

/**
 * Everything about hearing the circuit, in one place that never moves: input signal and level,
 * real-time playback, knob preview, the point listened to, cabinet - and the status line. It used
 * to sit at the bottom of the right sidebar, pushed off screen whenever a part was selected.
 */
export function TransportBar(props: TransportBarProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const { realtime, preview, cabinet } = props;
  const load = realtime.stats ? Math.round(realtime.stats.load * 100) : null;
  const sourceValue = props.source ? `${props.source.kind}:${props.source.id}` : "";

  return (
    <footer className="transport" aria-label="소리">
      <div className="transport-group">
        <label htmlFor="transport-input">입력</label>
        <select
          id="transport-input"
          value={sourceValue}
          onChange={(e) => {
            const v = e.target.value;
            if (v === FILE_OPTION) fileInput.current?.click();
            else if (v.startsWith("signal:")) props.onUseTestSignal(v.slice(7));
          }}
        >
          {!props.source && <option value="">신호 선택…</option>}
          {TEST_SIGNALS.map((s) => (
            <option key={s.id} value={`signal:${s.id}`} title={s.hint}>
              {s.label}
            </option>
          ))}
          {props.source?.kind === "file" && <option value={sourceValue}>{props.source.label}</option>}
          <option value={FILE_OPTION}>오디오 파일 열기…</option>
        </select>
        <input ref={fileInput} type="file" accept="audio/*" onChange={props.onFileChange} className="visually-hidden" aria-label="오디오 파일 선택" tabIndex={-1} />
        <input
          id="input-gain-slider"
          type="range"
          min={0.01}
          max={5}
          step={0.01}
          value={props.inputGain}
          onChange={(e) => props.onInputGainChange(Number(e.target.value))}
          aria-label="입력 레벨 (V)"
          title="입력 신호의 세기(볼트) - 기타 픽업은 보통 0.1~1V"
        />
        <span className="transport-value">{props.inputGain.toFixed(2)}V</span>
      </div>

      <div className="transport-group">
        <button
          type="button"
          className={realtime.active ? "transport-play active" : "transport-play"}
          onClick={realtime.onToggle}
          disabled={!realtime.supported}
          aria-pressed={realtime.active}
          title={
            realtime.supported
              ? "회로를 실시간으로 돌려 들려줍니다. 노브·값을 바꾸면 바로 반영됩니다 (Space)"
              : "이 브라우저는 AudioWorklet을 지원하지 않아 실시간 재생을 쓸 수 없습니다"
          }
        >
          {realtime.active ? "■ 실시간 정지" : "▶ 실시간 재생"}
        </button>
        {realtime.active && load !== null && (
          <span className={`transport-value${realtime.stats!.load > 0.8 ? " transport-warn" : ""}`} title="회로 계산에 드는 시간 / 재생 시간 - 100%를 넘으면 소리가 끊깁니다">
            부하 {load}%
          </span>
        )}
        {realtime.active && realtime.stats && realtime.stats.nonConvergent > 0 && <span className="transport-warn">수렴 실패 {realtime.stats.nonConvergent}</span>}
        <label className="transport-check" title="실시간 재생이 꺼져 있을 때, 노브나 값을 바꾸고 손을 떼면 0.6초 미리듣기를 들려줍니다">
          <input type="checkbox" checked={preview.enabled} onChange={(e) => preview.onEnabledChange(e.target.checked)} /> 노브 미리듣기
          {preview.busy ? "…" : ""}
        </label>
      </div>

      <div className="transport-group">
        <label htmlFor="output-node-select" title="소리를 듣고 분석할 회로 지점(출력 노드)">
          듣는 지점
        </label>
        <select id="output-node-select" value={props.outputNode} onChange={(e) => props.onOutputNodeChange(e.target.value)}>
          <option value="">선택 안 함</option>
          {props.netNames
            .filter((n) => n !== "0")
            .map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
        </select>
        <label htmlFor="transport-cabinet">캐비닛</label>
        <select
          id="transport-cabinet"
          value={cabinet.enabled ? cabinet.variant : ""}
          onChange={(e) => {
            if (!e.target.value) cabinet.onEnabledChange(false);
            else {
              cabinet.onVariantChange(e.target.value as CabinetVariant);
              cabinet.onEnabledChange(true);
            }
          }}
          title="기타 앰프 캐비닛을 거친 소리로 들려줍니다 (제네릭 IR)"
        >
          <option value="">끔</option>
          {Object.entries(CABINET_VARIANTS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {/* Progress and failures arrive asynchronously, so they have to be announced. */}
      <p className="transport-status" role="status" aria-live="polite" title={props.status}>
        {props.status}
      </p>
    </footer>
  );
}
