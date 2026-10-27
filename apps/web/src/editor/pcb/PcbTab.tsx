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

/** Everything about building the circuit: KiCad netlist, stripboard, PCB, enclosure. The most
 * recently generated board is what the enclosure is checked against. */
export function PcbTab({ parts, blocks, graph, outputNode }: PcbTabProps) {
  const [board, setBoard] = useState<BoardSize | null>(null);
  const controls = playerSections(blocks, parts).flatMap((s) => s.controls.map((c) => ({ label: c.param.label, kind: c.kind })));
  return (
    <>
      <PcbExportPanel parts={parts} graph={graph} outputNode={outputNode} />
      <StripboardPanel parts={parts} graph={graph} outputNode={outputNode} onBoardSize={(w, h) => setBoard({ w, h, source: "스트립보드" })} />
      <PcbLayoutPanel parts={parts} graph={graph} outputNode={outputNode} onBoardSize={(w, h) => setBoard({ w, h, source: "PCB" })} />
      <EnclosurePanel controls={controls} board={board} />
    </>
  );
}
