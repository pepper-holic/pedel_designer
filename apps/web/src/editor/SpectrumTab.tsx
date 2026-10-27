import { useMemo, useState } from "react";
import { computeSpectrum, findSpectrumPeaks } from "../core/analysis/spectrum";
import { Analyzer, type AnalyzerSeries } from "../viz/Analyzer";
import { AnalyzerControls } from "../viz/AnalyzerControls";
import { useAnalyzerSettings } from "../viz/analyzerSettings";
import { SeriesLegend } from "../viz/SeriesLegend";
import type { WaveformTrace } from "../viz/Waveform";
import type { ResolvedProbe } from "./probes";

interface SpectrumTabProps {
  /** Every net's trace from the last transient run, labelled by net name. */
  traces: WaveformTrace[] | null;
  sampleRate: number | null;
  probes: ResolvedProbe[];
  outputNode: string;
  /** Net the audio input source drives - its trace is the (gain-scaled) dry signal, drawn dashed
   * underneath as the "what went in" reference. */
  inputNet: string | null;
}

const OUTPUT_COLOR = "#191a10";
const INPUT_COLOR = "#8b8e75";
const PEAKS_PER_SERIES = 6;

function formatHz(f: number): string {
  return f >= 1000 ? `${(f / 1000).toFixed(2)}k` : f.toFixed(0);
}

/**
 * Bottom-dock "스펙트럼" tab: which frequencies are present at each probe after a simulation run,
 * and - while anything plays - a live analyzer (RTA) of the circuit's input and output.
 * A clipping stage shows up as a ladder of harmonics that is not in the input; a tone stage as a
 * tilt; comparing probes before and after a stage shows what that stage alone did.
 */
export function SpectrumTab({ traces, sampleRate, probes, outputNode, inputNet }: SpectrumTabProps) {
  const [showInput, setShowInput] = useState(true);
  const settings = useAnalyzerSettings();

  const series = useMemo((): AnalyzerSeries[] => {
    if (!traces || !sampleRate) return [];
    const byNet = new Map(traces.map((t) => [t.label, t.data]));
    const fftSize = settings.resolution;
    // Probes when there are any; otherwise the output node, so the tab still says something useful
    // for a user who has not discovered probes yet.
    const targets = probes.length > 0 ? probes.map((p) => ({ label: p.label, net: p.net, color: p.color })) : outputNode ? [{ label: `출력 (${outputNode})`, net: outputNode, color: OUTPUT_COLOR }] : [];
    const result: AnalyzerSeries[] = [];
    for (const t of targets) {
      const data = byNet.get(t.net);
      if (data) result.push({ label: t.label, spectrum: computeSpectrum(data, sampleRate, { fftSize }), color: t.color });
    }
    const input = inputNet ? byNet.get(inputNet) : undefined;
    if (showInput && input && result.length > 0 && !targets.some((t) => t.net === inputNet)) {
      result.unshift({ label: "입력 (원본)", spectrum: computeSpectrum(input, sampleRate, { fftSize }), color: INPUT_COLOR, dashed: true });
    }
    return result;
  }, [traces, sampleRate, probes, outputNode, inputNet, showInput, settings.resolution]);

  return (
    <div className="dock-fill">
      <div className="plot-toolbar">
        {series.length > 0 ? (
          <SeriesLegend series={series} />
        ) : (
          <span className="canvas-hint">
            {traces ? "표시할 지점이 없습니다 - 출력 노드나 프로브를 정하고 다시 실행하세요." : "시뮬레이션을 실행하면 지점별 스펙트럼이, 재생하면 실시간 스펙트럼이 표시됩니다."}
          </span>
        )}
        {series.length > 0 && (
          <label>
            <input type="checkbox" checked={showInput} onChange={(e) => setShowInput(e.target.checked)} /> 입력 겹쳐 보기
          </label>
        )}
        <AnalyzerControls settings={settings} />
      </div>
      {/* Plot and peak list side by side when there is room, so the list does not eat the plot's
          height; stacked on a narrow screen. */}
      <div className="spectrum-body">
        <div className="canvas-frame plot-frame">
          <Analyzer series={series} />
        </div>
        {series.length > 0 && (
          <table className="spectrum-peaks">
            <caption>주요 피크 (큰 순서)</caption>
            <tbody>
              {series.map((s) => (
                <tr key={s.label}>
                  <th scope="row" style={{ color: s.color }}>
                    {s.label}
                  </th>
                  <td>
                    {findSpectrumPeaks(s.spectrum, PEAKS_PER_SERIES)
                      .map((p) => `${formatHz(p.frequencyHz)}Hz ${p.magnitudeDb.toFixed(1)}dB`)
                      .join(" · ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
