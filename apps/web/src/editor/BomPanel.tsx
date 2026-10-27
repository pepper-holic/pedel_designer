import { useState } from "react";
import type { PartInstance } from "./types";
import { buildBom, bomToText } from "./bom";
import { estimatePowerSupplyDraw } from "./powerDraw";
import type { GraphNetlist } from "./netlistFromGraph";

interface BomPanelProps {
  parts: PartInstance[];
  graph: GraphNetlist;
}

/** Bill of materials: aggregates the placed parts by type + value/model into a shopping list, plus
 * an estimated current draw from any bias/supply source (transistor/JFET circuits only - see
 * powerDraw.ts for why ideal op-amp circuits have nothing to report here). */
export function BomPanel({ parts, graph }: BomPanelProps) {
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const rows = buildBom(parts);
  const totalCount = rows.reduce((sum, r) => sum + r.quantity, 0);
  const powerDraw = estimatePowerSupplyDraw(graph.netlist, graph.inputSourceId);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(bomToText(rows));
      setCopyStatus("복사됨");
    } catch {
      setCopyStatus("복사 실패 - 브라우저 클립보드 권한을 확인하세요");
    }
  };

  return (
    <div className="panel">
      <div className="panel-title">부품 목록 (BOM)</div>
      {rows.length === 0 ? (
        <p className="canvas-hint">캔버스에 부품을 배치하면 여기에 집계됩니다.</p>
      ) : (
        <>
          <div className="run-row">
            <button type="button" onClick={handleCopy}>
              표 복사 (탭 구분)
            </button>
            <span className="status-text">총 {totalCount}개 부품 · {rows.length}종</span>
            {copyStatus && <span className="canvas-hint">{copyStatus}</span>}
          </div>
          <table className="bom-table">
            <thead>
              <tr>
                <th>부품</th>
                <th>패키지</th>
                <th>수량</th>
                <th>소자 ID</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.label}|${row.package}`}>
                  <td>{row.label}</td>
                  <td>{row.package}</td>
                  <td>{row.quantity}</td>
                  <td className="bom-ids">{row.partIds.join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {powerDraw.length > 0 && (
            <p className="canvas-hint">
              예상 소비 전류:{" "}
              {powerDraw.map((d) => `${d.sourceId} (${d.voltageV}V) ${d.currentMa.toFixed(1)}mA`).join(" · ")}
              {" "}— 이상적 op-amp 회로는 실제 전원 소자를 모델링하지 않아 표시되지 않습니다.
            </p>
          )}
        </>
      )}
    </div>
  );
}
