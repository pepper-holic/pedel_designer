import { useState } from "react";
import type { GraphNetlist } from "../netlistFromGraph";
import type { BlockInstance, PartInstance } from "../types";
import { BomPanel } from "../BomPanel";
import { PcbExportPanel } from "../PcbExportPanel";
import { playerSections } from "../player/playerControls";
import { StripboardPanel } from "../pcb/StripboardPanel";
import { PcbLayoutPanel } from "../pcb/PcbLayoutPanel";
import { EnclosurePanel, type BoardSize } from "../pcb/EnclosurePanel";
import type { PedalAppearance } from "../player/pedalAppearance";

interface BuildWorkspaceProps {
  parts: PartInstance[];
  blocks: BlockInstance[];
  graph: GraphNetlist;
  outputNode: string;
  appearance: PedalAppearance;
  title: string;
}

const STEPS = [
  { id: "bom", label: "부품 목록", hint: "사야 할 부품과 값, 개수" },
  { id: "stripboard", label: "스트립보드", hint: "구리 스트립 보드에 자동 배치 - 보드를 다시 읽어 원래 회로와 대조 검증" },
  { id: "pcb", label: "PCB", hint: "자동 배치·배선, DRC, .kicad_pcb와 1:1 인쇄용 그림" },
  { id: "kicad", label: "KiCad 넷리스트", hint: "KiCad에서 직접 보드를 그릴 때 불러올 넷리스트" },
  { id: "enclosure", label: "인클로저", hint: "노브·잭·풋스위치 드릴 위치 1:1 템플릿과 보드 맞춤 검사" },
] as const;

type Step = (typeof STEPS)[number]["id"];

/**
 * The build step: a list of what to make on the left, the one being made filling the rest. Every
 * step stays mounted (hidden), so a generated board survives looking at the parts list; the board
 * generated last is what the enclosure is checked against.
 */
export function BuildWorkspace({ parts, blocks, graph, outputNode, appearance, title }: BuildWorkspaceProps) {
  const [board, setBoard] = useState<BoardSize | null>(null);
  const [step, setStep] = useState<Step>("bom");
  const controls = playerSections(blocks, parts).flatMap((s) => s.controls.map((c) => ({ label: c.param.label, kind: c.kind })));
  return (
    <div className="build-workspace">
      <nav className="panel build-steps" aria-label="만들기 단계">
        <div className="panel-title">만들기</div>
        <ol>
          {STEPS.map((s, i) => (
            <li key={s.id}>
              <button type="button" aria-current={step === s.id ? "step" : undefined} onClick={() => setStep(s.id)} aria-label={s.label} title={s.hint}>
                <span className="build-step-num">{i + 1}</span>
                <span>
                  <strong>{s.label}</strong>
                  <small>{s.hint}</small>
                </span>
              </button>
            </li>
          ))}
        </ol>
      </nav>
      <div className="panel build-main" data-fit-container>
        <div hidden={step !== "bom"}>
          <BomPanel parts={parts} graph={graph} />
        </div>
        <div hidden={step !== "kicad"}>
          <PcbExportPanel parts={parts} graph={graph} outputNode={outputNode} />
        </div>
        <div hidden={step !== "stripboard"}>
          <StripboardPanel parts={parts} graph={graph} outputNode={outputNode} onBoardSize={(w, h) => setBoard({ w, h, source: "스트립보드" })} />
        </div>
        <div hidden={step !== "pcb"}>
          <PcbLayoutPanel parts={parts} graph={graph} outputNode={outputNode} onBoardSize={(w, h) => setBoard({ w, h, source: "PCB" })} />
        </div>
        <div hidden={step !== "enclosure"}>
          <EnclosurePanel controls={controls} board={board} appearance={appearance} title={title} />
        </div>
      </div>
    </div>
  );
}
