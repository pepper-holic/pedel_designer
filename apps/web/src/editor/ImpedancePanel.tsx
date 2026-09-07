import { useMemo } from "react";
import { logFrequencySweep } from "../core/solver/ac";
import { sourceLoadImpedanceSweep } from "../core/analysis/impedance";
import type { GraphNetlist } from "./netlistFromGraph";

interface ImpedancePanelProps {
  graph: GraphNetlist;
}

const FREQUENCIES = logFrequencySweep(20, 20000, 30);
/** Decade markers to read the curve against, rather than a full chart - three numbers are enough to
 * answer "is this a stiff source or a fussy one". */
const READOUT_HZ = [100, 500, 1000, 5000, 10000];

function formatOhms(ohms: number): string {
  if (ohms >= 1e6) return `${(ohms / 1e6).toFixed(2)} MΩ`;
  if (ohms >= 1e3) return `${(ohms / 1e3).toFixed(1)} kΩ`;
  return `${ohms.toFixed(0)} Ω`;
}

/**
 * Bottom-dock "임피던스" tab: what the circuit looks like to whatever is driving it.
 *
 * The frequency response says what comes out; this says whether the thing in front will survive
 * being connected. It is the missing half of every pickup-loading and buffer-placement question
 * (docs/plan-ux-and-features.md §3).
 */
export function ImpedancePanel({ graph }: ImpedancePanelProps) {
  const points = useMemo(() => {
    if (!graph.inputSourceId) return [];
    try {
      return sourceLoadImpedanceSweep(graph.netlist, graph.inputSourceId, FREQUENCIES);
    } catch {
      return [];
    }
  }, [graph]);

  if (!graph.inputSourceId) return <p className="preset-description">회로에 입력 신호원이 없습니다. 전압원이나 픽업을 추가하고 배선하세요.</p>;
  if (points.length === 0) return <p className="preset-description">임피던스를 계산할 수 없습니다. 배선을 확인하세요.</p>;

  const nearest = (hz: number) =>
    points.reduce((best, p) => (Math.abs(p.frequencyHz - hz) < Math.abs(best.frequencyHz - hz) ? p : best));

  return (
    <div>
      <p className="canvas-hint">
        신호원이 바라보는 임피던스입니다. 값이 낮을수록 앞단을 세게 끌어당깁니다 — 패시브 픽업 앞에 낮은 임피던스가 오면 음량뿐 아니라 톤도 바뀝니다.
        (픽업 회로에서는 코일의 저항·인덕턴스가 함께 포함됩니다.)
      </p>
      <table className="impedance-table">
        <thead>
          <tr>
            <th scope="col">주파수</th>
            <th scope="col">임피던스</th>
          </tr>
        </thead>
        <tbody>
          {READOUT_HZ.map((hz) => (
            <tr key={hz}>
              <td>{hz >= 1000 ? `${hz / 1000} kHz` : `${hz} Hz`}</td>
              <td>{formatOhms(nearest(hz).magnitudeOhms)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
