import { useAudioRun } from "./useAudioRun";
import { useKnobPreview } from "./useKnobPreview";
import { useRealtimeAudio } from "./useRealtimeAudio";
import type { GraphNetlist } from "./netlistFromGraph";

interface EditorAudioOptions {
  graph: GraphNetlist;
  outputNode: string;
  inputGain: number;
  onStatus: (message: string) => void;
}

/**
 * Everything the editor plays: full simulation runs, the knob preview (D-0) and real-time playback
 * (D-2), sharing one AudioContext, input signal and cabinet choice.
 */
export function useEditorAudio({ graph, outputNode, inputGain, onStatus }: EditorAudioOptions) {
  const audio = useAudioRun({ graph, inputGain, onStatus });
  const shared = {
    graph,
    outputNode,
    inputGain,
    sample: audio.sample,
    getAudioContext: audio.getAudioContext,
    cabinet: audio.cabinetEnabled ? audio.cabinetVariant : null,
    onStatus,
  };
  const preview = useKnobPreview(shared);
  const realtime = useRealtimeAudio(shared);

  return {
    audio,
    preview,
    realtime,
    /** Call after any edit that changes the sound. While the circuit plays live the edit is
     * already being heard - a preview clip on top would only talk over it. */
    requestPreview: () => {
      if (!realtime.active) preview.request();
    },
    previewControl: { enabled: preview.enabled, onEnabledChange: preview.setEnabled, busy: preview.busy },
    realtimeControl: { supported: realtime.supported, active: realtime.active, stats: realtime.stats, onToggle: realtime.toggle },
  };
}
