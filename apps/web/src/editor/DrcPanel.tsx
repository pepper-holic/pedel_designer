import { useMemo } from "react";
import { runDrc } from "./drc";
import type { PartInstance, Wire } from "./types";

interface DrcPanelProps {
  parts: PartInstance[];
  wires: Wire[];
  outputNode: string;
  onSelectPart: (id: string) => void;
}

/** Bottom-dock "검사" tab: lists what is wrong with the circuit, worst first, with a way to jump to
 * the parts involved. */
export function DrcPanel({ parts, wires, outputNode, onSelectPart }: DrcPanelProps) {
  const issues = useMemo(() => runDrc(parts, wires, outputNode), [parts, wires, outputNode]);

  if (parts.length === 0) return <p className="preset-description">검사할 부품이 아직 없습니다. 소자를 추가하면 여기에 결과가 표시됩니다.</p>;

  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");

  if (issues.length === 0) {
    return <p className="preset-description">✓ 문제 없음 — 접지·입력 신호원·배선이 모두 확인됐습니다.</p>;
  }

  return (
    <div>
      <p className="canvas-hint">
        오류 {errors.length}건 · 경고 {warnings.length}건. 경고는 의도적인 배선일 수 있으니 내용을 보고 판단하세요.
      </p>
      {/* Results change as the user edits, so they are announced rather than silently replaced. */}
      <ul className="drc-list" aria-live="polite">
        {[...errors, ...warnings].map((issue) => (
          <li key={issue.code} className={issue.severity === "error" ? "drc-item drc-error" : "drc-item drc-warning"}>
            <span className="drc-badge">{issue.severity === "error" ? "오류" : "경고"}</span>
            <span className="drc-message">{issue.message}</span>
            {issue.partIds.length > 0 && (
              <button
                type="button"
                className="drc-jump"
                aria-label={`${issue.partIds[0]} 캔버스에서 선택`}
                onClick={() => onSelectPart(issue.partIds[0])}
              >
                {issue.partIds[0]} 선택
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
