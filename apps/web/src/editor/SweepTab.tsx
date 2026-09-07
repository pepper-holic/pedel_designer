import { useMemo, useState } from "react";
import { logFrequencySweep } from "../core/solver/ac";
import { FrequencyResponse, type ResponseSeries } from "../viz/FrequencyResponse";
import { sweepCandidates, sweepParameter } from "./paramSweep";
import type { PartInstance, Wire } from "./types";

interface SweepTabProps {
  parts: PartInstance[];
  wires: Wire[];
  outputNode: string;
}

/** Enough steps to read the shape without the overlay turning into a smear. */
const SWEEP_FREQUENCIES = logFrequencySweep(20, 20000, 40);

/** Dark-to-light along one hue, so the curves read as an ordered series (knob down to knob up)
 * rather than as unrelated categories. */
const CURVE_COLORS = ["#1f3a17", "#2f5623", "#3c6b2e", "#6b9455", "#9dbd84", "#c4d6b0"];

/**
 * Bottom-dock "노브 스윕" tab: plots one frequency response per position of a chosen knob or switch,
 * all on the same axes.
 *
 * A single response only answers "what does it sound like right now". Comparing settings is the
 * question people actually have about a tone knob, a selector or a treble-bleed network, and doing
 * it by hand means loading, screenshotting and eyeballing one setting at a time.
 */
export function SweepTab({ parts, wires, outputNode }: SweepTabProps) {
  const candidates = useMemo(() => sweepCandidates(parts), [parts]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const target = candidates.find((c) => c.partId === selectedId) ?? candidates[0] ?? null;

  const curves = useMemo(() => {
    if (!target || !outputNode) return [];
    try {
      return sweepParameter(parts, wires, outputNode, target, SWEEP_FREQUENCIES);
    } catch {
      // A mid-sweep position can be a topology the solver cannot settle (a switch that momentarily
      // floats the output, say). Showing nothing beats tearing the whole panel down.
      return [];
    }
  }, [parts, wires, outputNode, target]);

  const series: ResponseSeries[] = curves.map((curve, i) => ({
    label: curve.label,
    points: curve.points,
    color: CURVE_COLORS[i % CURVE_COLORS.length],
  }));

  if (!outputNode) return <p className="preset-description">출력 노드를 선택하면 노브별 주파수 응답을 겹쳐서 보여줍니다.</p>;
  if (candidates.length === 0) {
    return <p className="preset-description">스윕할 컨트롤이 없습니다. 포텐셔미터나 스위치를 회로에 추가하세요.</p>;
  }

  return (
    <div>
      <div className="field">
        <div className="field-row">
          <label htmlFor="sweep-target-select">스윕할 컨트롤</label>
        </div>
        <select id="sweep-target-select" value={target?.partId ?? ""} onChange={(e) => setSelectedId(e.target.value)}>
          {candidates.map((c) => (
            <option key={c.partId} value={c.partId}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      {series.length === 0 ? (
        <p className="preset-description">이 컨트롤로는 응답을 계산할 수 없습니다. 배선과 출력 노드를 확인하세요.</p>
      ) : (
        <>
          <div className="sweep-legend">
            {series.map((s) => (
              <span key={s.label} className="sweep-legend-item">
                <span className="sweep-legend-swatch" style={{ background: s.color }} />
                {s.label}
              </span>
            ))}
          </div>
          <div className="canvas-frame">
            <FrequencyResponse points={[]} series={series} />
          </div>
        </>
      )}
    </div>
  );
}
