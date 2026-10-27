import { InspectorPanel, type PartPatch } from "./InspectorPanel";
import { ProbePanel } from "./ProbePanel";
import { BlockInspector } from "./BlockInspector";
import { CircuitSummary } from "./shell/CircuitSummary";
import type { BlockInstance, PartInstance, Wire } from "./types";
import type { WorkMode } from "./shell/modes";

interface EditorSidebarRightProps {
  parts: PartInstance[];
  wires: Wire[];
  selectedPart: PartInstance | null;
  selectedWire: Wire | null;
  blocks: BlockInstance[];
  outputNode: string;
  onParamChange: (key: string, value: string) => void;
  onApplyModel: (paramsOverride: Record<string, number | string>) => void;
  onRotate: () => void;
  onMirror: () => void;
  onDelete: () => void;
  onDeleteBlock: (blockId: string) => void;
  probePanel: React.ComponentProps<typeof ProbePanel>;
  /** Set when a whole block is selected: its inspector replaces the part inspector. */
  blockInspector: React.ComponentProps<typeof BlockInspector> | null;
  onSelectBlock: (blockId: string) => void;
  onSelectPart: (id: string) => void;
  onResetWire: (wireId: string) => void;
  onPatchPart: (partId: string, patch: PartPatch) => void;
  onExposeParam: (blockId: string, partId: string, paramKey: string) => void;
  onModeChange: (mode: WorkMode) => void;
}

/**
 * Design step's right column: whatever is selected, or - with nothing selected - the circuit as a
 * whole (its check results and where to go next). Probes stay underneath either way. Everything
 * about hearing the circuit moved to the transport bar, so selecting a part no longer pushes it off
 * screen.
 */
export function EditorSidebarRight(props: EditorSidebarRightProps) {
  const nothingSelected = !props.blockInspector && !props.selectedPart && !props.selectedWire;
  return (
    <aside className="sidebar-right" aria-label="속성">
      {props.blockInspector ? (
        <BlockInspector {...props.blockInspector} />
      ) : nothingSelected ? (
        <CircuitSummary
          parts={props.parts}
          wires={props.wires}
          blockCount={props.blocks.length}
          outputNode={props.outputNode}
          onSelectPart={props.onSelectPart}
          onModeChange={props.onModeChange}
        />
      ) : (
        <InspectorPanel
          onSelectBlock={props.onSelectBlock}
          onExposeParam={props.onExposeParam}
          onResetWire={props.onResetWire}
          onPatchPart={props.onPatchPart}
          selectedPart={props.selectedPart}
          selectedWire={props.selectedWire}
          blocks={props.blocks}
          onParamChange={props.onParamChange}
          onApplyModel={props.onApplyModel}
          onRotate={props.onRotate}
          onMirror={props.onMirror}
          onDelete={props.onDelete}
          onDeleteBlock={props.onDeleteBlock}
        />
      )}

      <ProbePanel {...props.probePanel} />
    </aside>
  );
}
