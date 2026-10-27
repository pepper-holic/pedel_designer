import { useMemo, useRef, useState } from "react";
import { loadSampleFromFile, type LoadedSample } from "../audio/loadSample";
import { TEST_SIGNALS, generateTestSignal } from "../audio/testSignals";
import { playSamples } from "../audio/playback";
import { type CabinetVariant } from "../audio/cabinetIr";
import { runTransientAsync } from "../core/solver/runTransientAsync";
import { type WaveformTrace } from "../viz/Waveform";
import type { GraphNetlist } from "./netlistFromGraph";

/** Silence between the dry and processed halves of an A/B, so the switch is audible as a switch. */
const AB_GAP_SEC = 0.25;

/** What a run uses when no input has been chosen. */
const DEFAULT_SIGNAL = "chord";

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
  /** What the input is, for the transport bar: a built-in signal's id, or a file name. */
  const [sampleSource, setSampleSource] = useState<{ kind: "signal" | "file"; id: string; label: string } | null>(null);
  /** The circuit the current traces were simulated from - an edit since then makes them stale. */
  const [tracesNetlist, setTracesNetlist] = useState<string | null>(null);
  // Compared by content: moving a part on the canvas rebuilds the graph but changes nothing electrical.
  const netlistKey = useMemo(() => JSON.stringify(graph.netlist), [graph]);
  const [waveTraces, setWaveTraces] = useState<WaveformTrace[] | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [cabinetEnabled, setCabinetEnabled] = useState(false);
  const [cabinetVariant, setCabinetVariant] = useState<CabinetVariant>("brightCab4x12");
  // Off by default: backward Euler is unconditionally stable on any user-built topology, including
  // a tight feedback loop through two diodes. Trapezoidal is more accurate but can ring on exactly
  // that kind of stiff circuit, so it is an opt-in rather than a silent default switch.
  const [useTrapezoidal, setUseTrapezoidal] = useState(false);
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
    setSampleSource({ kind: "file", id: file.name, label: file.name });
    onStatus(`샘플 로드 완료 (${loaded.samples.length}개 샘플, ${loaded.sampleRate}Hz)`);
  };

  /** Loads one of the built-in signals so a first simulation needs no audio file at all. */
  const handleUseTestSignal = (id: string): LoadedSample | null => {
    const context = getAudioContext();
    const samples = generateTestSignal(id, context.sampleRate);
    if (samples.length === 0) return null;
    const loaded = { samples, sampleRate: context.sampleRate };
    setSample(loaded);
    const label = TEST_SIGNALS.find((t) => t.id === id)?.label ?? id;
    setSampleSource({ kind: "signal", id, label });
    onStatus(`내장 신호 사용: ${label}`);
    return loaded;
  };

  /** Runs the input through the circuit. With no input chosen yet it uses the built-in chord - the
   * same default real-time playback uses - rather than asking for a signal first. */
  const handleRun = async () => {
    if (!graph.inputSourceId) return;
    const input = sample ?? handleUseTestSignal(DEFAULT_SIGNAL);
    if (!input) return;
    setIsSimulating(true);
    onStatus("시뮬레이션 실행 중...");
    const scaled = new Float64Array(input.samples.length);
    for (let i = 0; i < scaled.length; i++) scaled[i] = input.samples[i] * inputGain;
    try {
      // Run off the main thread - a long user-uploaded file is enough per-sample Newton solving to
      // freeze the page if run inline (docs/ROADMAP.md §6).
      const { traces, nonConvergentSampleCount } = await runTransientAsync(graph.netlist, {
        inputSourceId: graph.inputSourceId,
        inputSamples: scaled,
        sampleRate: input.sampleRate,
        tapNodes: graph.netNames.filter((n) => n !== "0"),
        // Resolves fast clipping knees (germanium diodes etc.) that a single 44.1/48kHz sample
        // period would otherwise alias away (docs/ROADMAP.md §6 risk 2). THD/Monte Carlo/chain use
        // short synthesized tones and stay at the default (no oversampling) - not worth the 4x cost.
        oversample: 4,
        ...(useTrapezoidal ? { integration: "trapezoidal" as const } : {}),
      });
      setTracesNetlist(netlistKey);
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

  /** The input in volts, as the circuit saw it - what the analyzer's "pre" curve shows. */
  const scaledInput = () => {
    if (!sample) return undefined;
    const out = new Float64Array(sample.samples.length);
    for (let i = 0; i < out.length; i++) out[i] = sample.samples[i] * inputGain;
    return out;
  };

  const handlePlay = (label: string) => {
    if (!waveTraces || !sample) return;
    const trace = waveTraces.find((t) => t.label === label);
    if (!trace) return;
    playSamples(trace.data, sample.sampleRate, getAudioContext(), cabinetEnabled ? cabinetVariant : null, { pre: scaledInput(), post: trace.data });
  };

  /**
   * Plays the dry input and then a tap, back to back with a short gap.
   *
   * Judging a drive circuit means hearing the difference, and doing that by clicking two buttons in
   * turn leaves a gap long enough to forget what the first one sounded like.
   */
  const handleCompare = async (label: string) => {
    if (!waveTraces || !sample) return;
    const trace = waveTraces.find((t) => t.label === label);
    if (!trace) return;
    const context = getAudioContext();
    playSamples(sample.samples, sample.sampleRate, context, null, { pre: scaledInput() });
    const drySeconds = sample.samples.length / sample.sampleRate;
    await new Promise((resolve) => setTimeout(resolve, (drySeconds + AB_GAP_SEC) * 1000));
    playSamples(trace.data, sample.sampleRate, context, cabinetEnabled ? cabinetVariant : null, { pre: scaledInput(), post: trace.data });
  };

  return {
    sample,
    sampleSource,
    waveTraces,
    /** True when the circuit was edited after the traces were simulated. */
    tracesStale: waveTraces !== null && tracesNetlist !== netlistKey,
    /** Called when the circuit is replaced - traces from the old circuit would be misleading. */
    clearTraces: () => setWaveTraces(null),
    isSimulating,
    cabinetEnabled,
    setCabinetEnabled,
    cabinetVariant,
    setCabinetVariant,
    useTrapezoidal,
    setUseTrapezoidal,
    getAudioContext,
    handleFileChange,
    handleUseTestSignal,
    handleRun,
    handlePlay,
    handleCompare,
  };
}
