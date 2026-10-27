import { InspectorPanel } from "./InspectorPanel";
import { OutputAudioPanel } from "./OutputAudioPanel";
import { ProbePanel } from "./ProbePanel";
import type { BlockInstance, PartInstance, Wire } from "./types";
import type { GraphNetlist } from "./netlistFromGraph";
import type { useAudioRun } from "./useAudioRun";

interface EditorSidebarRightProps {
  selectedPart: PartInstance | null;
  selectedWire: Wire | null;
  blocks: BlockInstance[];
  graph: GraphNetlist;
  outputNode: string;
  onOutputNodeChange: (node: string) => void;
  inputGain: number;
  onInputGainChange: (gain: number) => void;
  status: string;
  audio: ReturnType<typeof useAudioRun>;
  onParamChange: (key: string, value: string) => void;
  onApplyModel: (paramsOverride: Record<string, number | string>) => void;
  onRotate: () => void;
  onDelete: () => void;
  onDeleteBlock: (blockId: string) => void;
  probePanel: React.ComponentProps<typeof ProbePanel>;
}

/** Right dock: what is selected on top, what to do with the whole circuit's output below. */
export function EditorSidebarRight(props: EditorSidebarRightProps) {
  const { audio, graph } = props;
  return (
    <div className="sidebar-right">
      <InspectorPanel
        selectedPart={props.selectedPart}
        selectedWire={props.selectedWire}
        blocks={props.blocks}
        onParamChange={props.onParamChange}
        onApplyModel={props.onApplyModel}
        onRotate={props.onRotate}
        onDelete={props.onDelete}
        onDeleteBlock={props.onDeleteBlock}
      />

      <ProbePanel {...props.probePanel} />

      <OutputAudioPanel
        outputNode={props.outputNode}
        onOutputNodeChange={props.onOutputNodeChange}
        netNames={graph.netNames}
        inputGain={props.inputGain}
        onInputGainChange={props.onInputGainChange}
        hasSample={audio.sample !== null}
        onFileChange={audio.handleFileChange}
        onUseTestSignal={audio.handleUseTestSignal}
        useTrapezoidal={audio.useTrapezoidal}
        onUseTrapezoidalChange={audio.setUseTrapezoidal}
        canRun={audio.sample !== null && !!graph.inputSourceId && !audio.isSimulating}
        onRun={audio.handleRun}
        status={props.status}
      />
    </div>
  );
}
