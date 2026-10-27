import { useMemo, useState } from "react";
import { computeSpectrum, findSpectrumPeaks } from "../core/analysis/spectrum";
import { Spectrum, type SpectrumSeries } from "../viz/Spectrum";
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
 * Bottom-dock "스펙트럼" tab: which frequencies are present at each probe after a simulation run.
 * A clipping stage shows up as a ladder of harmonics that is not in the input; a tone stage as a
 * tilt; comparing probes before and after a stage shows what that stage alone did.
 */
export function SpectrumTab({ traces, sampleRate, probes, outputNode, inputNet }: SpectrumTabProps) {
  const [showInput, setShowInput] = useState(true);

  const series = useMemo((): SpectrumSeries[] => {
    if (!traces || !sampleRate) return [];
    const byNet = new Map(traces.map((t) => [t.label, t.data]));
    // Probes when there are any; otherwise the output node, so the tab still says something useful
    // for a user who has not discovered probes yet.
    const targets = probes.length > 0 ? probes.map((p) => ({ label: p.label, net: p.net, color: p.color })) : outputNode ? [{ label: `출력 (${outputNode})`, net: outputNode, color: OUTPUT_COLOR }] : [];
    const result: SpectrumSeries[] = [];
    for (const t of targets) {
      const data = byNet.get(t.net);
      if (data) result.push({ label: t.label, spectrum: computeSpectrum(data, sampleRate), color: t.color });
    }
    const input = inputNet ? byNet.get(inputNet) : undefined;
    if (showInput && input && result.length > 0 && !targets.some((t) => t.net === inputNet)) {
      result.unshift({ label: "입력 (원본)", spectrum: computeSpectrum(input, sampleRate), color: INPUT_COLOR, dashed: true });
    }
    return result;
  }, [traces, sampleRate, probes, outputNode, inputNet, showInput]);

  if (!traces) return <p className="preset-description">시뮬레이션을 실행하면 프로브 지점마다 어떤 주파수 성분이 있는지(배음 구조)가 여기에 표시됩니다.</p>;
  if (series.length === 0) {
    return <p className="preset-description">표시할 지점이 없습니다. 출력 노드를 선택하거나 회로도 위 "프로브"로 측정 지점을 찍은 뒤 다시 실행하세요.</p>;
  }

  return (
    <div>
      <div className="field-row" style={{ marginBottom: 6 }}>
        <SeriesLegend series={series} />
        <label>
          <input type="checkbox" checked={showInput} onChange={(e) => setShowInput(e.target.checked)} /> 입력 신호 겹쳐 보기
        </label>
      </div>
      <div className="canvas-frame">
        <Spectrum series={series} />
      </div>
      <table className="spectrum-peaks">
        <caption>주요 피크 (큰 순서)</caption>
        <tbody>
          {series.map((s) => (
            <tr key={s.label}>
              <th scope="row" style={{ color: s.color }}>
                {s.label}
              </th>
              {findSpectrumPeaks(s.spectrum, PEAKS_PER_SERIES).map((p) => (
                <td key={p.frequencyHz}>
                  {formatHz(p.frequencyHz)}Hz <span>{p.magnitudeDb.toFixed(1)}dB</span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
