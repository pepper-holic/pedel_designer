import { CABINET_VARIANTS, type CabinetVariant } from "../audio/cabinetIr";
import { Waveform, type WaveformTrace } from "../viz/Waveform";

interface WaveformTabProps {
  traces: WaveformTrace[] | null;
  onPlay: (label: string) => void;
  cabinetEnabled: boolean;
  onCabinetEnabledChange: (enabled: boolean) => void;
  cabinetVariant: CabinetVariant;
  onCabinetVariantChange: (variant: CabinetVariant) => void;
}

/** Bottom-dock "파형" tab: plots the last transient-simulation result and lets the user play back
 * any tap point, optionally through a cabinet IR. */
export function WaveformTab({ traces, onPlay, cabinetEnabled, onCabinetEnabledChange, cabinetVariant, onCabinetVariantChange }: WaveformTabProps) {
  if (!traces) return <p className="preset-description">시뮬레이션을 실행하면 결과 파형이 여기에 표시됩니다.</p>;

  return (
    <>
      <div className="canvas-frame">
        <Waveform traces={traces} />
      </div>
      <div className="tap-buttons">
        {traces.map((t) => (
          <button key={t.label} type="button" onClick={() => onPlay(t.label)}>
            ▶ {t.label}
          </button>
        ))}
      </div>
      <div className="field-row" style={{ marginTop: 10 }}>
        <label>
          <input type="checkbox" checked={cabinetEnabled} onChange={(e) => onCabinetEnabledChange(e.target.checked)} /> IR 적용 (제네릭 캐비닛 시뮬레이션)
        </label>
        <select
          value={cabinetVariant}
          onChange={(e) => onCabinetVariantChange(e.target.value as CabinetVariant)}
          disabled={!cabinetEnabled}
          style={{ maxWidth: 220 }}
        >
          {Object.entries(CABINET_VARIANTS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </div>
    </>
  );
}
