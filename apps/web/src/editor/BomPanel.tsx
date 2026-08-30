import { useState } from "react";
import type { PartInstance } from "./types";
import { buildBom, bomToText } from "./bom";

interface BomPanelProps {
  parts: PartInstance[];
}

/** Bill of materials: aggregates the placed parts by type + value/model into a shopping list. */
export function BomPanel({ parts }: BomPanelProps) {
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const rows = buildBom(parts);
  const totalCount = rows.reduce((sum, r) => sum + r.quantity, 0);

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
                <th>수량</th>
                <th>소자 ID</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label}>
                  <td>{row.label}</td>
                  <td>{row.quantity}</td>
                  <td className="bom-ids">{row.partIds.join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
