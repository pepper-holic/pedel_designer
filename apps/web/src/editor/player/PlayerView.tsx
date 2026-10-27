import { useMemo } from "react";
import { computeSpectrum } from "../../core/analysis/spectrum";
import type { AcPoint } from "../../core/solver/ac";
import { FrequencyResponse } from "../../viz/FrequencyResponse";
import { Analyzer, type AnalyzerSeries } from "../../viz/Analyzer";
import { SWITCH_POSITION_LABELS } from "../switchLabels";
import type { RealtimeControl } from "../shell/TransportBar";
import type { OutputSnapshot } from "../useRealtimeAudio";
import type { BlockParam } from "../types";
import { Knob } from "./Knob";
import type { PlayerControl, PlayerSection } from "./playerControls";

const OUTPUT_COLOR = "#191a10";
const PLOT_HEIGHT = 170;

export interface PlayerViewProps {
  title: string;
  sections: PlayerSection[];
  onSetControl: (param: BlockParam, value: number) => void;
  realtime: RealtimeControl;
  preview: { enabled: boolean; onEnabledChange: (on: boolean) => void; busy: boolean; lastClip: OutputSnapshot | null };
  /** Small-signal response at the output node, recomputed on every edit. */
  response: AcPoint[];
}

function Control({ control, onSetControl }: { control: PlayerControl; onSetControl: PlayerViewProps["onSetControl"] }) {
  const { param, part } = control;
  if (control.kind === "knob") {
    const value = Number(part.params.position);
    return (
      <div className="pedal-control">
        <Knob label={param.label} value={value} onChange={(v) => onSetControl(param, v)} />
        <div className="pedal-control-label">{param.label}</div>
        <div className="pedal-control-value">{Math.round(value * 100)}%</div>
      </div>
    );
  }
  const positions = SWITCH_POSITION_LABELS[part.type] ?? [];
  const current = Number(part.params.switchPosition);
  return (
    <div className="pedal-control">
      <div className="pedal-switch" role="radiogroup" aria-label={`${param.label} 스위치`}>
        {positions.map((label, i) => (
          <button key={label} type="button" role="radio" aria-checked={current === i} title={label} onClick={() => onSetControl(param, i)}>
            {i + 1}
          </button>
        ))}
      </div>
      <div className="pedal-control-label">{param.label}</div>
      <div className="pedal-control-value">{positions[current] ?? "-"}</div>
    </div>
  );
}

/**
 * The instrument player's view (plan Stage D-3): no schematic, just the pedal's face - the knobs
 * and switches its blocks expose - a footswitch that plays it live, and beside it the response
 * and the output spectrum, so "that sounds darker" can be checked against "the treble rolled off".
 * The input signal, its level and the knob preview are in the transport bar below, as everywhere.
 */
export function PlayerView(props: PlayerViewProps) {
  const { realtime, preview, sections } = props;
  // The live analyzer takes over while anything plays; between times the last preview clip stays up.
  const lastClip = preview.lastClip;
  const series = useMemo(
    (): AnalyzerSeries[] =>
      lastClip ? [{ label: "마지막 미리듣기", spectrum: computeSpectrum(lastClip.samples, lastClip.sampleRate, { fftSize: 16384 }), color: OUTPUT_COLOR }] : [],
    [lastClip],
  );
  const load = realtime.stats ? Math.round(realtime.stats.load * 100) : null;

  return (
    <div className="player-view" data-player-view>
      <div className="pedal-face">
        <div className="pedal-title">{props.title}</div>
        {sections.length === 0 ? (
          <p className="canvas-hint">
            노출된 노브나 스위치가 없습니다. 회로도에서 블록을 선택하고 블록 인스펙터에서 파라미터를 노출하거나, 가변저항·스위치를 배치하세요.
          </p>
        ) : (
          <div className="pedal-sections">
            {sections.map((section) => (
              <section key={section.id} className="pedal-section" aria-label={section.label}>
                <h3>{section.label}</h3>
                <div className="pedal-controls">
                  {section.controls.map((control) => (
                    <Control key={control.param.id} control={control} onSetControl={props.onSetControl} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
        <div className="pedal-footer">
          <span className={`pedal-led${realtime.active ? " pedal-led-on" : ""}`} aria-hidden="true" />
          <button
            type="button"
            className="pedal-footswitch"
            aria-pressed={realtime.active}
            aria-label="실시간 재생 (풋스위치)"
            disabled={!realtime.supported}
            onClick={realtime.onToggle}
            title={realtime.supported ? "밟으면 회로가 실시간으로 울립니다" : "이 브라우저는 실시간 재생을 지원하지 않습니다"}
          />
          <span className="pedal-footer-text">{realtime.active ? `ON · 부하 ${load ?? "-"}%` : "OFF"}</span>
        </div>
      </div>

      <aside className="player-side">
        <div className="panel">
          <div className="panel-title">주파수 응답 (소신호)</div>
          {props.response.length > 0 ? (
            <FrequencyResponse points={props.response} height={PLOT_HEIGHT} />
          ) : (
            <p className="canvas-hint">출력 노드를 정하면 응답 곡선이 나타납니다.</p>
          )}
        </div>
        <div className="panel">
          <div className="panel-title">스펙트럼 (RTA)</div>
          <Analyzer series={series} height={PLOT_HEIGHT} />
        </div>
      </aside>
    </div>
  );
}
