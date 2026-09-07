import { useRef, useState } from "react";
import { loadSampleFromFile, type LoadedSample } from "../audio/loadSample";
import { playSamples } from "../audio/playback";
import { type CabinetVariant } from "../audio/cabinetIr";
import { runTransientAsync } from "../core/solver/runTransientAsync";
import { type WaveformTrace } from "../viz/Waveform";
import type { GraphNetlist } from "./netlistFromGraph";

/** Trace colours, in the order nodes come out of the netlist. */
const TRACE_COLORS = ["#3c6b2e", "#7c9300", "#8a4a2a", "#191a10"];

interface UseAudioRunOptions {
  graph: GraphNetlist;
  inputGain: number;
  /** Progress and failure messages, surfaced by the editor's status line. */
  onStatus: (message: string) => void;
}

/**
 * Everything about pushing an audio file through the circuit: the loaded sample, the resulting
 * traces, playback, and the cabinet IR toggle.
 *
 * Split out of SchematicEditor because none of it touches the circuit graph - it only reads the
 * netlist the editor already built - and keeping it here is what lets that component stay about
 * editing (docs/plan-ux-and-features.md §3).
 */
export function useAudioRun({ graph, inputGain, onStatus }: UseAudioRunOptions) {
  const [sample, setSample] = useState<LoadedSample | null>(null);
  const [waveTraces, setWaveTraces] = useState<WaveformTrace[] | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [cabinetEnabled, setCabinetEnabled] = useState(false);
  const [cabinetVariant, setCabinetVariant] = useState<CabinetVariant>("brightCab4x12");
  const audioContextRef = useRef<AudioContext | null>(null);

  const getAudioContext = () => {
    if (!audioContextRef.current) audioContextRef.current = new AudioContext();
    return audioContextRef.current;
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    onStatus("샘플 디코딩 중...");
    const loaded = await loadSampleFromFile(file, getAudioContext());
    setSample(loaded);
    onStatus(`샘플 로드 완료 (${loaded.samples.length}개 샘플, ${loaded.sampleRate}Hz)`);
  };

  const handleRun = async () => {
    if (!sample || !graph.inputSourceId) return;
    setIsSimulating(true);
    onStatus("시뮬레이션 실행 중...");
    const scaled = new Float64Array(sample.samples.length);
    for (let i = 0; i < scaled.length; i++) scaled[i] = sample.samples[i] * inputGain;
    try {
      // Run off the main thread - a long user-uploaded file is enough per-sample Newton solving to
      // freeze the page if run inline (docs/ROADMAP.md §6).
      const { traces, nonConvergentSampleCount } = await runTransientAsync(graph.netlist, {
        inputSourceId: graph.inputSourceId,
        inputSamples: scaled,
        sampleRate: sample.sampleRate,
        tapNodes: graph.netNames.filter((n) => n !== "0"),
        // Resolves fast clipping knees (germanium diodes etc.) that a single 44.1/48kHz sample
        // period would otherwise alias away (docs/ROADMAP.md §6 risk 2). THD/Monte Carlo/chain use
        // short synthesized tones and stay at the default (no oversampling) - not worth the 4x cost.
        oversample: 4,
      });
      setWaveTraces(
        Array.from(traces.entries()).map(([label, data], i) => ({
          label,
          data,
          color: TRACE_COLORS[i % TRACE_COLORS.length],
        })),
      );
      // A stiff/badly-conditioned circuit (e.g. a tight feedback loop through two diodes) can fail to
      // converge on some samples - the solver falls back to its last guess rather than throwing or
      // producing NaN, so without this the user would have no way to know those samples are suspect.
      onStatus(
        nonConvergentSampleCount > 0
          ? `시뮬레이션 완료 (경고: ${nonConvergentSampleCount}개 샘플에서 수렴 실패 - 해당 구간 파형 정확도가 낮을 수 있습니다)`
          : "시뮬레이션 완료",
      );
    } catch (err) {
      onStatus(`시뮬레이션 실패: ${err instanceof Error ? err.message : "알 수 없는 오류"}`);
    } finally {
      setIsSimulating(false);
    }
  };

  const handlePlay = (label: string) => {
    if (!waveTraces || !sample) return;
    const trace = waveTraces.find((t) => t.label === label);
    if (!trace) return;
    playSamples(trace.data, sample.sampleRate, getAudioContext(), cabinetEnabled ? cabinetVariant : null);
  };

  return {
    sample,
    waveTraces,
    /** Called when the circuit is replaced - traces from the old circuit would be misleading. */
    clearTraces: () => setWaveTraces(null),
    isSimulating,
    cabinetEnabled,
    setCabinetEnabled,
    cabinetVariant,
    setCabinetVariant,
    getAudioContext,
    handleFileChange,
    handleRun,
    handlePlay,
  };
}
