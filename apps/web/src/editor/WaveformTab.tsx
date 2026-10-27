import { useState } from "react";
import { Waveform, type WaveformTrace } from "../viz/Waveform";
import type { ResolvedProbe } from "./probes";

interface WaveformTabProps {
  /** Every net's trace from the last run, labelled by net name. */
  traces: WaveformTrace[] | null;
  /** Length of the run, for the time axis. */
  durationSeconds?: number;
  /** When there are probes, their traces lead (named and coloured as on the canvas) and the rest of
   * the nets fold away under "전체 노드". */
  probes?: ResolvedProbe[];
  onPlay: (net: string) => void;
  onCompare: (net: string) => void;
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

/** "파형" analysis tab: plots the last transient-simulation result and lets the user play back any
 * tap point (through the cabinet chosen in the transport bar, if any). */
export function WaveformTab({ traces, durationSeconds, probes = [], onPlay, onCompare }: WaveformTabProps) {
  const [showAll, setShowAll] = useState(false);
  if (!traces) return <p className="preset-description">위의 "▶ 시뮬레이션 실행"을 누르면 입력 신호를 회로에 통과시킨 파형이 여기에 표시됩니다.</p>;

  const byNet = new Map(traces.map((t) => [t.label, t]));
  const probed: ShownTrace[] = probes.flatMap((p) => {
    const t = byNet.get(p.net);
    return t ? [{ label: `${p.label} (${p.net})`, data: t.data, color: p.color, net: p.net }] : [];
  });
  const all: ShownTrace[] = traces.map((t) => ({ ...t, net: t.label }));
  const primary = probed.length > 0 ? probed : all;
  const rest = probed.length > 0 ? all.filter((t) => !probes.some((p) => p.net === t.net)) : [];

  return (
    <div className="dock-fill">
      <div className="canvas-frame plot-frame">
        <Waveform traces={primary} durationSeconds={durationSeconds} />
      </div>
      <div className="plot-toolbar">
        <TapButtons traces={primary} onPlay={onPlay} onCompare={onCompare} />
      </div>
      {rest.length > 0 && (
        <div className="waveform-more">
          <button type="button" onClick={() => setShowAll((v) => !v)} aria-expanded={showAll}>
            {showAll ? "▾" : "▸"} 전체 노드 ({rest.length}개)
          </button>
          {showAll && (
            <>
              <div className="canvas-frame">
                <Waveform traces={rest} heightPerTrace={72} durationSeconds={durationSeconds} />
              </div>
              <TapButtons traces={rest} onPlay={onPlay} onCompare={onCompare} />
            </>
          )}
        </div>
      )}
    </div>
  );
}
