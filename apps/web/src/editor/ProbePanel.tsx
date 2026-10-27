import { formatVoltage, type OperatingPoint } from "./operatingPoint";
import { MAX_PROBES, type ResolvedProbe } from "./probes";

interface ProbePanelProps {
  probes: ResolvedProbe[];
  probeMode: boolean;
  onProbeModeChange: (on: boolean) => void;
  onRename: (id: string, label: string) => void;
  onRemove: (id: string) => void;
  operatingPoint: OperatingPoint | null;
}

/** Right-sidebar list of measurement points: rename them (the name shows on the canvas and in every
 * plot legend), see each one's DC bias, remove them. */
export function ProbePanel({ probes, probeMode, onProbeModeChange, onRename, onRemove, operatingPoint }: ProbePanelProps) {
  return (
    <div className="panel">
      <div className="panel-title">프로브 (측정 지점)</div>
      {probes.length === 0 ? (
        <p className="preset-description">
          회로도 위 "프로브" 버튼(단축키 P)을 켜고 단자나 배선을 클릭하면 그 지점의 주파수 응답·파형·스펙트럼을 함께 볼 수 있습니다.
        </p>
      ) : (
        <ul className="probe-list">
          {probes.map((p) => {
            const dc = operatingPoint?.voltages.get(p.net);
            return (
              <li key={p.id} className="probe-row">
                <span className="probe-swatch" style={{ background: p.color }} aria-hidden="true" />
                <input aria-label={`${p.id} 이름`} value={p.label} onChange={(e) => onRename(p.id, e.target.value)} maxLength={24} />
                <span className="probe-meta" title="노드 이름 / DC 바이어스 전압">
                  {p.net}
                  {dc !== undefined ? ` · ${formatVoltage(dc)}` : ""}
                </span>
                <button type="button" onClick={() => onRemove(p.id)} aria-label={`${p.label} 프로브 삭제`}>
                  ✕
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="field-row" style={{ marginTop: 8 }}>
        <button type="button" aria-pressed={probeMode} onClick={() => onProbeModeChange(!probeMode)}>
          {probeMode ? "프로브 모드 끄기" : "프로브 찍기"}
        </button>
        <span className="probe-meta">
          {probes.length}/{MAX_PROBES}
        </span>
      </div>
      {operatingPoint && !operatingPoint.converged && (
        <p className="preset-description">⚠ DC 동작점 계산이 수렴하지 않았습니다 - 표시된 전압은 근사값입니다.</p>
      )}
    </div>
  );
}
