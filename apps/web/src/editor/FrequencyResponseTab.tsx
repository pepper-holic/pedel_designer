import type { AcPoint } from "../core/solver/ac";
import type { MonteCarloResult } from "../core/analysis/montecarlo";
import { FrequencyResponse } from "../viz/FrequencyResponse";

export type AcStatus = "no-output" | "no-source" | "error" | "ok";

interface FrequencyResponseTabProps {
  status: AcStatus;
  error: string | null;
  points: AcPoint[];
  band: MonteCarloResult | null;
}

/** Bottom-dock "주파수 응답" tab: renders the Bode plot once an output node is picked, otherwise
 * explains what's missing (no output node selected, no source in the circuit, or a solver error). */
export function FrequencyResponseTab({ status, error, points, band }: FrequencyResponseTabProps) {
  if (status === "no-output") return <p className="preset-description">출력 노드를 선택하면 여기에 실시간으로 표시됩니다.</p>;
  if (status === "no-source") return <p className="preset-description">회로에 입력 전압원이 없습니다. 전압원(입력) 소자를 추가하고 배선하세요.</p>;
  if (status === "error") {
    return (
      <p className="preset-description" style={{ color: "#c0392b" }}>
        ⚠ 계산 실패: 회로 구성을 확인하세요 (플로팅 노드, 닫히지 않은 루프 등). {error}
      </p>
    );
  }
  return (
    <div className="canvas-frame">
      <FrequencyResponse points={points} band={band ?? undefined} />
    </div>
  );
}
