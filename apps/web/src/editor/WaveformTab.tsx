import { useState } from "react";
import { CABINET_VARIANTS, type CabinetVariant } from "../audio/cabinetIr";
import { Waveform, type WaveformTrace } from "../viz/Waveform";
import type { ResolvedProbe } from "./probes";

interface WaveformTabProps {
  /** Every net's trace from the last run, labelled by net name. */
  traces: WaveformTrace[] | null;
  /** When there are probes, their traces lead (named and coloured as on the canvas) and the rest of
   * the nets fold away under "전체 노드". */
  probes?: ResolvedProbe[];
  onPlay: (net: string) => void;
  onCompare: (net: string) => void;
  cabinetEnabled: boolean;
  onCabinetEnabledChange: (enabled: boolean) => void;
  cabinetVariant: CabinetVariant;
  onCabinetVariantChange: (variant: CabinetVariant) => void;
}

interface ShownTrace extends WaveformTrace {
  net: string;
}

function TapButtons({ traces, onPlay, onCompare }: { traces: ShownTrace[]; onPlay: (net: string) => void; onCompare: (net: string) => void }) {
  return (
    <div className="tap-buttons">
      {traces.map((t) => (
        <span key={t.net} className="tap-button-pair">
          <button type="button" onClick={() => onPlay(t.net)} aria-label={`${t.label} 지점 소리 재생`}>
            ▶ {t.label}
          </button>
          <button
            type="button"
            onClick={() => onCompare(t.net)}
            aria-label={`원본과 ${t.label} 지점 소리 비교 재생`}
            title="원본 소리를 먼저 들려준 뒤 이 지점의 소리를 이어서 재생합니다"
          >
            A/B
          </button>
        </span>
      ))}
    </div>
  );
}

/** Bottom-dock "파형" tab: plots the last transient-simulation result and lets the user play back
 * any tap point, optionally through a cabinet IR. */
export function WaveformTab({ traces, probes = [], onPlay, onCompare, cabinetEnabled, onCabinetEnabledChange, cabinetVariant, onCabinetVariantChange }: WaveformTabProps) {
  const [showAll, setShowAll] = useState(false);
  if (!traces) return <p className="preset-description">시뮬레이션을 실행하면 결과 파형이 여기에 표시됩니다.</p>;

  const byNet = new Map(traces.map((t) => [t.label, t]));
  const probed: ShownTrace[] = probes.flatMap((p) => {
    const t = byNet.get(p.net);
    return t ? [{ label: `${p.label} (${p.net})`, data: t.data, color: p.color, net: p.net }] : [];
  });
  const all: ShownTrace[] = traces.map((t) => ({ ...t, net: t.label }));
  const primary = probed.length > 0 ? probed : all;
  const rest = probed.length > 0 ? all.filter((t) => !probes.some((p) => p.net === t.net)) : [];

  return (
    <>
      <div className="canvas-frame">
        <Waveform traces={primary} />
      </div>
      <TapButtons traces={primary} onPlay={onPlay} onCompare={onCompare} />
      {rest.length > 0 && (
        <div className="waveform-more">
          <button type="button" onClick={() => setShowAll((v) => !v)} aria-expanded={showAll}>
            {showAll ? "▾" : "▸"} 전체 노드 ({rest.length}개)
          </button>
          {showAll && (
            <>
              <div className="canvas-frame">
                <Waveform traces={rest} heightPerTrace={80} />
              </div>
              <TapButtons traces={rest} onPlay={onPlay} onCompare={onCompare} />
            </>
          )}
        </div>
      )}
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
