import { useState } from "react";
import { boardFit, checkHoles, defaultDrillPlan, ENCLOSURES, interior, smallestFit, type DrillHole, type PanelControl } from "./enclosure";
import { drawEnclosure, enclosureSvg, sheetDeltaToFace, sheetSize } from "./enclosureDrawing";
import { enclosureArtShapes, enclosureArtSvg } from "./enclosureArt";
import { BoardViewport, ZoomControls } from "./BoardViewport";
import { Icon } from "../../ui/Icon";
import type { PedalAppearance } from "../player/pedalAppearance";

export interface BoardSize {
  w: number;
  h: number;
  source: string;
}

interface EnclosurePanelProps {
  controls: PanelControl[];
  board: BoardSize | null;
  appearance: PedalAppearance;
  title: string;
}

type View = "drill" | "art";

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "image/svg+xml" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Enclosure tab (plan Stage E-4): pick a box, get a drilling layout for the knobs and switches the
 * circuit exposes plus jacks, DC, LED and footswitch, drag holes to taste, check the board fits,
 * print the unfolded box at true size.
 */
export function EnclosurePanel({ controls, board, appearance, title }: EnclosurePanelProps) {
  const suggested = board ? smallestFit(board.w, board.h) : null;
  const [chosen, setChosen] = useState<string | null>(null);
  const [view, setView] = useState<View>("drill");
  const enclosure = ENCLOSURES.find((e) => e.id === (chosen ?? suggested?.id ?? "1590B"))!;
  const controlsKey = controls.map((c) => `${c.kind}:${c.label}`).join("|");
  // Moved holes, per box and control set: changing either starts from the default layout again.
  const [moved, setMoved] = useState<{ key: string; holes: DrillHole[] } | null>(null);
  const planKey = `${enclosure.id}|${controlsKey}`;
  const defaults = defaultDrillPlan(enclosure, controls);
  const holes = moved?.key === planKey ? moved.holes : defaults;
  const issues = checkHoles(enclosure, holes);
  const fit = board ? boardFit(enclosure, board.w, board.h) : null;
  const inside = interior(enclosure);
  const [dragStart, setDragStart] = useState<DrillHole[] | null>(null);
  const [zoom, setZoom] = useState(1);
  const size = view === "drill" ? sheetSize(enclosure) : { w: enclosure.width, h: enclosure.length };

  const moveHole = (from: DrillHole[], id: string, dxSheet: number, dySheet: number) => {
    const next = from.map((h) => {
      if (h.id !== id) return h;
      const d = sheetDeltaToFace(h.face, dxSheet, dySheet);
      return { ...h, x: Math.round((h.x + d.dx) * 2) / 2, y: Math.round((h.y + d.dy) * 2) / 2 };
    });
    setMoved({ key: planKey, holes: next });
  };

  return (
    <div className="panel">
      <div className="panel-title">
        인클로저 드릴 템플릿
        <span
          className="info-tip"
          title="노출된 노브·스위치로 포트 구멍을, 표준 위치로 잭·DC·LED·풋스위치 구멍을 배치합니다. 구멍을 끌어 옮길 수 있고, 1:1로 인쇄해 상자에 붙이고 센터 펀치로 찍으면 됩니다."
        >
          <Icon name="info" />
        </span>
      </div>
      <div className="run-row">
        <label htmlFor="enclosure-select">인클로저</label>
        <select id="enclosure-select" value={enclosure.id} onChange={(e) => setChosen(e.target.value)}>
          {ENCLOSURES.map((e) => (
            <option key={e.id} value={e.id}>
              {e.label} - {e.length}×{e.width}×{e.height}mm
            </option>
          ))}
        </select>
        <button type="button" onClick={() => setMoved(null)} disabled={moved?.key !== planKey}>
          기본 배치로
        </button>
        <div className="run-row" role="group" aria-label="보기 전환">
          <button type="button" aria-pressed={view === "drill"} onClick={() => setView("drill")}>
            드릴 템플릿
          </button>
          <button type="button" aria-pressed={view === "art"} onClick={() => setView("art")}>
            데칼 그래픽
          </button>
        </div>
        {view === "drill" ? (
          <button type="button" onClick={() => download(`${enclosure.id}-drill.svg`, enclosureSvg(enclosure, holes))}>
            1:1 SVG 다운로드
          </button>
        ) : (
          <button type="button" onClick={() => download(`${enclosure.id}-decal.svg`, enclosureArtSvg(enclosure, holes, appearance, title))}>
            1:1 SVG 다운로드
          </button>
        )}
        <ZoomControls zoom={zoom} onZoom={setZoom} label={view === "drill" ? "드릴 템플릿" : "데칼 그래픽"} />
      </div>
      {view === "art" && (
        <p className="canvas-hint">
          연주 화면에서 고른 색·글꼴로 윗면 그래픽을 1:1로 인쇄합니다. 라미네이트해 붙인 뒤 그 위로 드릴 템플릿을 대고 구멍을 뚫으세요. 저장한 SVG 파일을 브라우저가 아닌 다른 프로그램에서 열면
          선택한 글꼴이 기본 글꼴로 바뀔 수 있습니다.
        </p>
      )}
      <p className={fit && !fit.fits ? "drc-error" : "canvas-hint"} role="status">
        {board
          ? fit!.fits
            ? `${board.source} ${board.w.toFixed(0)}×${board.h.toFixed(0)}mm → 내부 약 ${inside.width.toFixed(0)}×${inside.length.toFixed(0)}mm에 들어갑니다${fit!.rotated ? " (90° 돌려서)" : ""}.`
            : `${board.source} ${board.w.toFixed(0)}×${board.h.toFixed(0)}mm는 ${enclosure.id} 내부(약 ${inside.width.toFixed(0)}×${inside.length.toFixed(0)}mm)에 들어가지 않습니다${suggested ? ` - ${suggested.id}를 권장합니다` : ""}.`
          : "위에서 스트립보드나 PCB를 만들면 이 상자에 들어가는지 함께 확인합니다."}
      </p>
      {issues.length > 0 && (
        <ul className="build-notes">
          {issues.map((i) => (
            <li key={i.message}>{i.message}</li>
          ))}
        </ul>
      )}
      <BoardViewport
        zoom={zoom}
        shapes={view === "drill" ? drawEnclosure(enclosure, holes, new Set(issues.map((i) => i.holeId))) : enclosureArtShapes(enclosure, holes, appearance, title)}
        width={size.w}
        height={size.h}
        label={view === "drill" ? `${enclosure.id} 드릴 템플릿` : `${enclosure.id} 데칼 그래픽`}
        onDrag={
          view === "drill"
            ? (id, dx, dy) => {
                // Moves are relative to where the hole was when the drag started.
                const start = dragStart ?? holes;
                if (!dragStart) setDragStart(holes);
                moveHole(start, id, dx, dy);
              }
            : undefined
        }
        onDragEnd={view === "drill" ? () => setDragStart(null) : undefined}
      />
    </div>
  );
}
