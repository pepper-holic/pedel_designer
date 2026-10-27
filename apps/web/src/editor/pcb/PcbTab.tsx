import { useState } from "react";
import type { GraphNetlist } from "../netlistFromGraph";
import type { BlockInstance, PartInstance } from "../types";
import { PcbExportPanel } from "../PcbExportPanel";
import { playerSections } from "../player/playerControls";
import { StripboardPanel } from "./StripboardPanel";
import { PcbLayoutPanel } from "./PcbLayoutPanel";
import { EnclosurePanel, type BoardSize } from "./EnclosurePanel";

interface PcbTabProps {
  parts: PartInstance[];
  blocks: BlockInstance[];
  graph: GraphNetlist;
  outputNode: string;
}

const SECTIONS = [
  { id: "kicad", label: "KiCad 넷리스트", hint: 'KiCad PCB 에디터의 "File → Import → Netlist"로 불러올 넷리스트 - 풋프린트와 패드 번호가 맞춰진 심볼 포함' },
  {
    id: "stripboard",
    label: "스트립보드",
    hint: "가로 구리 스트립 보드에 자동 배치하고, 보드에서 넷리스트를 다시 읽어 원래 회로와 비교 검증합니다. 부품 드래그·구멍 클릭(컷)으로 고칠 수 있습니다.",
  },
  { id: "pcb", label: "PCB", hint: "자동 배치·배선(단면은 점퍼, 양면은 비아), 기하 DRC, .kicad_pcb와 1:1 인쇄용 SVG" },
  { id: "enclosure", label: "인클로저", hint: "노브·스위치·잭·DC·LED·풋스위치 드릴 위치를 1:1로 인쇄하는 템플릿과 보드 맞춤 검사" },
] as const;

type Section = (typeof SECTIONS)[number]["id"];

/**
 * Everything about building the circuit: KiCad netlist, stripboard, PCB, enclosure - one at a
 * time, so each gets the dock's whole height instead of four panels stacked in it. All stay
 * mounted (hidden), so a generated board survives switching. The most recently generated board is
 * what the enclosure is checked against.
 */
export function PcbTab({ parts, blocks, graph, outputNode }: PcbTabProps) {
  const [board, setBoard] = useState<BoardSize | null>(null);
  const [section, setSection] = useState<Section>("stripboard");
  const controls = playerSections(blocks, parts).flatMap((s) => s.controls.map((c) => ({ label: c.param.label, kind: c.kind })));
  return (
    <div className="pcb-tab">
      <div className="view-toggle pcb-sections" role="group" aria-label="만들기 단계">
        {SECTIONS.map((s) => (
          <button key={s.id} type="button" aria-pressed={section === s.id} onClick={() => setSection(s.id)} title={s.hint}>
            {s.label}
          </button>
        ))}
      </div>
      <div hidden={section !== "kicad"}>
        <PcbExportPanel parts={parts} graph={graph} outputNode={outputNode} />
      </div>
      <div hidden={section !== "stripboard"}>
        <StripboardPanel parts={parts} graph={graph} outputNode={outputNode} onBoardSize={(w, h) => setBoard({ w, h, source: "스트립보드" })} />
      </div>
      <div hidden={section !== "pcb"}>
        <PcbLayoutPanel parts={parts} graph={graph} outputNode={outputNode} onBoardSize={(w, h) => setBoard({ w, h, source: "PCB" })} />
      </div>
      <div hidden={section !== "enclosure"}>
        <EnclosurePanel controls={controls} board={board} />
      </div>
    </div>
  );
}
