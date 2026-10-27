import type { AcPoint } from "../core/solver/ac";
import type { MonteCarloResult } from "../core/analysis/montecarlo";
import { FrequencyResponse, type ResponseSeries } from "../viz/FrequencyResponse";
import { SeriesLegend } from "../viz/SeriesLegend";

export type AcStatus = "no-output" | "no-source" | "error" | "ok";

interface FrequencyResponseTabProps {
  status: AcStatus;
  error: string | null;
  points: AcPoint[];
  /** Per-probe curves. When present they are drawn together with the output, so the response can be
   * read stage by stage along the signal path. */
  probeSeries?: ResponseSeries[];
  outputNode?: string;
  band: MonteCarloResult | null;
}

const OUTPUT_COLOR = "#191a10";

/** Bottom-dock "주파수 응답" tab: renders the Bode plot once an output node or probe is picked,
 * otherwise explains what's missing (nothing to measure, no source in the circuit, or a solver error). */
export function FrequencyResponseTab({ status, error, points, probeSeries = [], outputNode = "", band }: FrequencyResponseTabProps) {
  if (status === "no-output") {
    return <p className="preset-description">출력 노드를 선택하거나 회로도 위 "프로브"로 측정 지점을 찍으면 여기에 실시간으로 표시됩니다.</p>;
  }
  if (status === "no-source") return <p className="preset-description">회로에 입력 전압원이 없습니다. 전압원(입력) 소자를 추가하고 배선하세요.</p>;
  if (status === "error") {
    return (
      <p className="preset-description" style={{ color: "#c0392b" }}>
        ⚠ 계산 실패: 회로 구성을 확인하세요 (플로팅 노드, 닫히지 않은 루프 등). {error}
      </p>
    );
  }
  if (probeSeries.length === 0) {
    return (
      <div className="canvas-frame">
        <FrequencyResponse points={points} band={band ?? undefined} />
      </div>
    );
  }
  // The output is drawn last (on top) and in ink, so it reads as the reference the probes lead up to.
  // Skipped when a probe already sits on the output net - same curve twice is just noise.
  const series = [...probeSeries];
  if (outputNode && points.length > 0 && !probeSeries.some((s) => s.points === points)) {
    series.push({ label: `출력 (${outputNode})`, points, color: OUTPUT_COLOR });
  }
  return (
    <div>
      <SeriesLegend series={series} />
      <div className="canvas-frame">
        <FrequencyResponse points={[]} series={series} />
      </div>
      {band && <p className="preset-description">부품 공차 범위(음영)는 프로브가 없을 때 출력 곡선에만 표시됩니다.</p>}
    </div>
  );
}
