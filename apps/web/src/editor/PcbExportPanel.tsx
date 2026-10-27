import { useState } from "react";
import type { PartInstance } from "./types";
import type { GraphNetlist } from "./netlistFromGraph";
import { buildKicadNetlist } from "./kicadNetlist";
import { buildBoardNetlist } from "./pcb/boardNetlist";

interface PcbExportPanelProps {
  parts: PartInstance[];
  graph: GraphNetlist;
  outputNode: string;
}

const PROJECT_NAME = "pedal-designer-export";

/** KiCad-compatible netlist export: lets the user pull the placed circuit into KiCad's PCB editor
 * (File > Import > Netlist) with every footprint already assigned (pcb/footprints.ts). */
export function PcbExportPanel({ parts, graph, outputNode }: PcbExportPanelProps) {
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const hasParts = parts.some((p) => p.type !== "ground");
  const notes = hasParts ? buildBoardNetlist(parts, graph, outputNode).notes : [];

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(buildKicadNetlist(parts, graph, PROJECT_NAME, outputNode));
      setCopyStatus("복사됨");
    } catch {
      setCopyStatus("복사 실패 - 브라우저 클립보드 권한을 확인하세요");
    }
  };

  const handleDownload = () => {
    const blob = new Blob([buildKicadNetlist(parts, graph, PROJECT_NAME, outputNode)], { type: "text/plain" });
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
            'KiCad PCB 에디터의 "File → Import → Netlist"로 불러올 수 있는 형식입니다. 부품마다 풋프린트(인스펙터에서 변경 가능)와 ' +
            "패드 번호가 맞춰진 심볼이 지정되고, 출력 잭·op-amp 전원 커넥터도 함께 들어갑니다."
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
          {notes.length > 0 && (
            <ul className="build-notes">
              {notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
