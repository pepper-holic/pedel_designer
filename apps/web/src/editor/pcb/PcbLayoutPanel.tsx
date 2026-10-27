import { useMemo, useRef, useState } from "react";
import type { GraphNetlist } from "../netlistFromGraph";
import type { PartInstance } from "../types";
import { buildBoardNetlist } from "./boardNetlist";
import { checkPcb } from "./pcbDrc";
import { drawPcb, pcbSvg, PCB_MARGIN, type PcbView } from "./pcbDrawing";
import { DEFAULT_RULES, type PcbLayout } from "./pcbTypes";
import { buildKicadPcb } from "./kicadPcb";
import { generatePcbAsync } from "./generatePcbAsync";
import { ShapeSvg } from "./ShapeSvg";

/** Screen pixels per millimetre. */
const SCALE = 6;

const VIEWS: { id: PcbView; label: string }[] = [
  { id: "top", label: "위에서 보기" },
  { id: "bottom-transfer", label: "아랫면 동박 (전사용, 미러)" },
  { id: "top-transfer", label: "윗면 동박 (전사용)" },
  { id: "assembly", label: "부품 배치도" },
];

interface PcbLayoutPanelProps {
  parts: PartInstance[];
  graph: GraphNetlist;
  outputNode: string;
  /** Called with the board's size in mm whenever a board is generated. */
  onBoardSize?: (width: number, height: number) => void;
}

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * PCB tab (plan Stage E-3): automatic placement and routing, a geometric DRC, and the outputs - a
 * KiCad board to keep editing, and true-size prints for etching at home and for assembly.
 */
export function PcbLayoutPanel({ parts, graph, outputNode, onBoardSize }: PcbLayoutPanelProps) {
  const board = useMemo(() => buildBoardNetlist(parts, graph, outputNode), [parts, graph, outputNode]);
  const [singleSided, setSingleSided] = useState(true);
  const [layout, setLayout] = useState<PcbLayout | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<PcbView>("top");
  const run = useRef(0);
  const issues = useMemo(() => (layout ? checkPcb(layout, board) : []), [layout, board]);
  const hasParts = parts.some((p) => p.type !== "ground");

  const generate = async () => {
    const id = ++run.current;
    setBusy(true);
    setError(null);
    try {
      const result = await generatePcbAsync(board, new Map(parts.map((p) => [p.id, { x: p.x, y: p.y }])), { ...DEFAULT_RULES, singleSided });
      if (id === run.current) {
        setLayout(result);
        onBoardSize?.(result.width, result.height);
      }
    } catch (err) {
      if (id === run.current) setError(err instanceof Error ? err.message : "알 수 없는 오류");
    } finally {
      if (id === run.current) setBusy(false);
    }
  };

  const views = VIEWS.filter((v) => v.id !== "top-transfer" || (layout && !layout.rules.singleSided));
  const shownView = views.some((v) => v.id === view) ? view : "top";

  return (
    <div className="panel">
      <div className="panel-title">
        PCB 자동 배치·배선
        <span
          className="info-tip"
          title="회로도 배치(신호 흐름)에서 출발해 부품을 모으고, 0.635mm 격자에서 배선합니다(트랙 0.6mm, 간격 0.4mm). 단면은 남는 연결을 점퍼 와이어로, 양면은 비아로 처리합니다. 결과는 배선과 별개로 기하 DRC로 다시 검사합니다."
        >
          ⓘ
        </span>
      </div>
      {!hasParts ? (
        <p className="canvas-hint">캔버스에 부품을 배치하면 PCB를 만들 수 있습니다.</p>
      ) : (
        <>
          <div className="run-row">
            <div className="view-toggle" role="group" aria-label="기판 종류">
              <button type="button" aria-pressed={singleSided} onClick={() => setSingleSided(true)}>
                단면 (점퍼 허용)
              </button>
              <button type="button" aria-pressed={!singleSided} onClick={() => setSingleSided(false)}>
                양면
              </button>
            </div>
            <button type="button" className={layout ? "" : "primary"} onClick={generate} disabled={busy}>
              {busy ? "배치·배선 중..." : layout ? "다시 생성" : "PCB 생성"}
            </button>
            {layout && (
              <>
                <button type="button" onClick={() => download("pedal.kicad_pcb", buildKicadPcb(layout, board), "text/plain")}>
                  .kicad_pcb 다운로드
                </button>
                <button type="button" onClick={() => download(`pedal-${shownView}.svg`, pcbSvg(layout, board, shownView), "image/svg+xml")}>
                  이 보기 1:1 SVG
                </button>
              </>
            )}
          </div>
          {error && <p className="drc-error">{error}</p>}
          {layout && (
            <>
              <p className={issues.length === 0 ? "strip-ok" : "drc-error"} role="status">
                {issues.length === 0 ? "✓ DRC 통과" : `✗ DRC ${issues.length}건`} · {layout.width.toFixed(1)}×{layout.height.toFixed(1)}mm · 트랙{" "}
                {layout.tracks.length} · 점퍼 {layout.links.length} · 비아 {layout.vias.length}
                {layout.unrouted.length > 0 ? ` · 미배선 ${layout.unrouted.length}` : ""}
              </p>
              {issues.length > 0 && (
                <ul className="build-notes">
                  {issues.slice(0, 8).map((i) => (
                    <li key={i.message}>{i.message}</li>
                  ))}
                </ul>
              )}
              <div className="view-toggle" role="group" aria-label="PCB 보기">
                {views.map((v) => (
                  <button key={v.id} type="button" aria-pressed={shownView === v.id} onClick={() => setView(v.id)}>
                    {v.label}
                  </button>
                ))}
              </div>
              <div className="stripboard-scroll">
                <ShapeSvg
                  shapes={drawPcb(layout, board, shownView)}
                  width={layout.width + PCB_MARGIN * 2}
                  height={layout.height + PCB_MARGIN * 2}
                  scale={SCALE}
                  label={`PCB ${VIEWS.find((v) => v.id === shownView)!.label}`}
                />
              </div>
              {layout.links.length > 0 && (
                <p className="canvas-hint">점선은 부품면에 납땜하는 점퍼 와이어입니다 (단면 기판에서 배선하지 못한 연결).</p>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
