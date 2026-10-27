import { useMemo, useState } from "react";
import type { GraphNetlist } from "../netlistFromGraph";
import type { PartInstance } from "../types";
import { buildBoardNetlist } from "./boardNetlist";
import { generateStripboard } from "./stripboard";
import { verifyStripboard } from "./stripboardVerify";
import { drawStripboard, MARGIN, stripboardBuildNotes, stripboardSheetSvg, type BoardSide } from "./stripboardDrawing";
import type { Hole, StripboardLayout } from "./stripboardTypes";
import { ShapeSvg } from "./ShapeSvg";

const SCALE = 30;

interface StripboardPanelProps {
  parts: PartInstance[];
  graph: GraphNetlist;
  outputNode: string;
  /** Called with the board's size in mm whenever a layout is generated. */
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

/** Moves a part by whole holes, growing the board if it goes past an edge. */
function movePart(layout: StripboardLayout, ref: string, delta: Hole): StripboardLayout {
  const placements = layout.placements.map((p) => {
    if (p.ref !== ref) return p;
    const minRow = Math.min(...p.pins.map((q) => q.row), p.body?.rowFrom ?? Infinity);
    const minCol = Math.min(...p.pins.map((q) => q.col), p.body?.colFrom ?? Infinity);
    const dr = Math.max(delta.row, -minRow);
    const dc = Math.max(delta.col, -minCol);
    return {
      ...p,
      pins: p.pins.map((q) => ({ ...q, row: q.row + dr, col: q.col + dc })),
      body: p.body && { rowFrom: p.body.rowFrom + dr, rowTo: p.body.rowTo + dr, colFrom: p.body.colFrom + dc, colTo: p.body.colTo + dc },
    };
  });
  let { rows, cols } = layout;
  for (const p of placements) {
    for (const q of p.pins) {
      rows = Math.max(rows, q.row + 1);
      cols = Math.max(cols, q.col + 1);
    }
  }
  return { ...layout, placements, rows, cols };
}

function toggleCut(layout: StripboardLayout, hole: Hole): StripboardLayout {
  const exists = layout.cuts.some((c) => c.row === hole.row && c.col === hole.col);
  return { ...layout, cuts: exists ? layout.cuts.filter((c) => c.row !== hole.row || c.col !== hole.col) : [...layout.cuts, hole] };
}

/**
 * Stripboard tab (plan Stage E-2): generate a layout, check it against the circuit, adjust it by
 * hand (drag a part, click a hole to add or remove a cut - re-checked instantly), and take it to
 * the bench as a 1:1 print and a build list.
 */
export function StripboardPanel({ parts, graph, outputNode, onBoardSize }: StripboardPanelProps) {
  const board = useMemo(() => buildBoardNetlist(parts, graph, outputNode), [parts, graph, outputNode]);
  const [layout, setLayout] = useState<StripboardLayout | null>(null);
  const [side, setSide] = useState<BoardSide>("component");
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ ref: string; x: number; y: number; delta: Hole } | null>(null);
  const check = useMemo(() => (layout ? verifyStripboard(layout, board) : null), [layout, board]);
  const hasParts = parts.some((p) => p.type !== "ground");

  const generate = () => {
    try {
      const next = generateStripboard(board, new Map(parts.map((p) => [p.id, p.x])));
      setLayout(next);
      onBoardSize?.(next.cols * 2.54, next.rows * 2.54);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "알 수 없는 오류");
    }
  };

  const offsets = drag ? new Map([[drag.ref, drag.delta]]) : undefined;
  const shapes = layout ? drawStripboard(layout, side, offsets) : [];

  return (
    <div className="panel">
      <div className="panel-title">
        스트립보드 레이아웃
        <span
          className="info-tip"
          title="가로 구리 스트립 보드(베로보드)에 부품을 자동 배치합니다. 생성 결과는 보드에서 넷리스트를 다시 읽어 원래 회로와 비교 검증합니다. 부품을 끌어 옮기거나 구멍을 클릭해 컷을 넣고 빼면 즉시 다시 검증합니다."
        >
          ⓘ
        </span>
      </div>
      {!hasParts ? (
        <p className="canvas-hint">캔버스에 부품을 배치하면 스트립보드 레이아웃을 만들 수 있습니다.</p>
      ) : (
        <>
          <div className="run-row">
            <button type="button" className={layout ? "" : "primary"} onClick={generate}>
              {layout ? "다시 생성" : "스트립보드 생성"}
            </button>
            {layout && (
              <>
                <div className="view-toggle" role="group" aria-label="보드 면">
                  <button type="button" aria-pressed={side === "component"} onClick={() => setSide("component")}>
                    부품면
                  </button>
                  <button type="button" aria-pressed={side === "copper"} onClick={() => setSide("copper")}>
                    동박면
                  </button>
                </div>
                <button type="button" onClick={() => download("stripboard.svg", stripboardSheetSvg(layout), "image/svg+xml")}>
                  1:1 SVG 다운로드
                </button>
                <button type="button" onClick={() => download("stripboard-build.txt", stripboardBuildNotes(layout), "text/plain")}>
                  빌드 노트 (.txt)
                </button>
              </>
            )}
          </div>
          {error && <p className="drc-error">{error}</p>}
          {layout && check && (
            <>
              <p className={check.ok ? "strip-ok" : "drc-error"} role="status">
                {check.ok
                  ? `✓ 회로와 일치 (역검증 통과) · ${layout.cols}×${layout.rows}구멍 · 컷 ${layout.cuts.length} · 점퍼 ${layout.jumpers.length}`
                  : `✗ 회로와 다릅니다 (${check.problems.length}건)`}
              </p>
              {!check.ok && (
                <ul className="build-notes">
                  {check.problems.slice(0, 8).map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              )}
              <div className="stripboard-body">
                <div className="stripboard-scroll">
                  <ShapeSvg
                    shapes={shapes}
                    width={layout.cols + MARGIN * 2}
                    height={layout.rows + MARGIN * 2}
                    scale={SCALE}
                    label={`스트립보드 ${side === "component" ? "부품면" : "동박면"}`}
                    onHoleClick={(hole) => setLayout(toggleCut(layout, hole))}
                    onPartPointerDown={
                      side === "component"
                        ? (ref, e) => {
                            (e.target as Element).setPointerCapture?.(e.pointerId);
                            setDrag({ ref, x: e.clientX, y: e.clientY, delta: { row: 0, col: 0 } });
                          }
                        : undefined
                    }
                    onPointerMove={(e) => {
                      if (!drag) return;
                      const delta = { row: Math.round((e.clientY - drag.y) / SCALE), col: Math.round((e.clientX - drag.x) / SCALE) };
                      if (delta.row !== drag.delta.row || delta.col !== drag.delta.col) setDrag({ ...drag, delta });
                    }}
                    onPointerUp={() => {
                      if (drag && (drag.delta.row !== 0 || drag.delta.col !== 0)) setLayout(movePart(layout, drag.ref, drag.delta));
                      setDrag(null);
                    }}
                  />
                </div>
                <table className="bom-table stripboard-legend">
                  <tbody>
                    {layout.placements.map((p) => (
                      <tr key={p.ref}>
                        <th scope="row">{p.ref}</th>
                        <td>{p.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {board.notes.length > 0 && (
                <ul className="build-notes">
                  {board.notes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
