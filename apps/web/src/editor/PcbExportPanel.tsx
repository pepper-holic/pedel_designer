import { useState } from "react";
import type { PartInstance } from "./types";
import type { GraphNetlist } from "./netlistFromGraph";
import { buildKicadNetlist } from "./kicadNetlist";

interface PcbExportPanelProps {
  parts: PartInstance[];
  graph: GraphNetlist;
}

const PROJECT_NAME = "pedal-designer-export";

/** KiCad-compatible netlist export: lets the user pull the placed circuit into KiCad's PCB editor
 * (File > Import > Netlist) to lay out and route the board there. This tool only exports
 * connectivity + a best-effort symbol guess, not footprints or an auto-router - see §5 of the
 * project roadmap for why that scope was chosen. */
export function PcbExportPanel({ parts, graph }: PcbExportPanelProps) {
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const hasParts = parts.some((p) => p.type !== "ground");

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(buildKicadNetlist(parts, graph, PROJECT_NAME));
      setCopyStatus("복사됨");
    } catch {
      setCopyStatus("복사 실패 - 브라우저 클립보드 권한을 확인하세요");
    }
  };

  const handleDownload = () => {
    const blob = new Blob([buildKicadNetlist(parts, graph, PROJECT_NAME)], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${PROJECT_NAME}.net`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="panel">
      <div className="panel-title">
        PCB 익스포트 (KiCad 넷리스트)
        <span
          className="info-tip"
          title={
            'KiCad PCB 에디터의 "File → Import → Netlist"로 불러올 수 있는 형식입니다. 풋프린트는 비어 있으니 KiCad에서 ' +
            "직접 할당해야 하고, 배치/라우팅도 자동화되어 있지 않습니다 - 연결 정보만 가져옵니다."
          }
        >
          ⓘ
        </span>
      </div>
      {!hasParts ? (
        <p className="canvas-hint">캔버스에 부품을 배치하면 넷리스트를 만들 수 있습니다.</p>
      ) : (
        <>
          <div className="run-row">
            <button type="button" onClick={handleDownload}>
              .net 파일 다운로드
            </button>
            <button type="button" onClick={handleCopy}>
              텍스트 복사
            </button>
            {copyStatus && <span className="canvas-hint">{copyStatus}</span>}
          </div>
        </>
      )}
    </div>
  );
}
