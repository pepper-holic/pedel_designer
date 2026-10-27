import { useEffect, useRef, useState } from "react";
import workletUrl from "../audio/realtime/realtimeWorklet?worker&url";
import { resampleLinear } from "../audio/realtime/realtimeEngine";
import type { FromEngine, ToEngine } from "../audio/realtime/protocol";
import { generateCabinetIr, type CabinetVariant } from "../audio/cabinetIr";
import { generateTestSignal } from "../audio/testSignals";
import type { LoadedSample } from "../audio/loadSample";
import type { GraphNetlist } from "./netlistFromGraph";

/** Consecutive stats reports (0.25s each) above full load before giving up on real time. */
const OVERLOAD_REPORTS = 4;

interface RealtimeAudioOptions {
  graph: GraphNetlist;
  outputNode: string;
  inputGain: number;
  sample: LoadedSample | null;
  getAudioContext: () => AudioContext;
  cabinet: CabinetVariant | null;
  onStatus: (message: string) => void;
}

/** The latest stretch of live output, for the player view's spectrum. */
export interface OutputSnapshot {
  samples: ArrayLike<number>;
  sampleRate: number;
}

export interface RealtimeStats {
  load: number;
  level: number;
  nonConvergent: number;
}

/** True where this browser can run the real-time engine at all. */
export function realtimeSupported(): boolean {
  return typeof AudioContext !== "undefined" && typeof AudioWorkletNode !== "undefined";
}

function inputLoop(sample: LoadedSample | null, contextRate: number): Float32Array {
  if (sample) return resampleLinear(sample.samples, sample.sampleRate, contextRate);
  return Float32Array.from(generateTestSignal("chord", contextRate));
}

/**
 * Real-time playback (plan Stage D-2): the circuit runs inside an AudioWorklet, looping the
 * selected input, and every edit - a knob turned, a value typed - is heard as it happens instead
 * of after a re-simulation. If the circuit is too heavy to solve in real time on this machine, it
 * stops and says so; the knob preview (D-0) still works then.
 */
export function useRealtimeAudio({ graph, outputNode, inputGain, sample, getAudioContext, cabinet, onStatus }: RealtimeAudioOptions) {
  const [active, setActive] = useState(false);
  const [stats, setStats] = useState<RealtimeStats | null>(null);
  const [snapshot, setSnapshot] = useState<OutputSnapshot | null>(null);
  const contextRate = useRef(48000);
  const node = useRef<AudioWorkletNode | null>(null);
  const convolver = useRef<ConvolverNode | null>(null);
  const moduleLoaded = useRef<Promise<void> | null>(null);
  const overloadCount = useRef(0);
  const started = useRef({ inputSourceId: "", outputNode: "" });
  const latest = useRef({ graph, outputNode, inputGain, sample, cabinet, onStatus, getAudioContext });

  useEffect(() => {
    latest.current = { graph, outputNode, inputGain, sample, cabinet, onStatus, getAudioContext };
  });

  const post = (message: ToEngine) => node.current?.port.postMessage(message);

  const stop = (status?: string) => {
    post({ type: "stop" });
    node.current?.disconnect();
    convolver.current?.disconnect();
    node.current = null;
    convolver.current = null;
    setActive(false);
    setStats(null);
    setSnapshot(null);
    if (status) latest.current.onStatus(status);
  };

  /** Worklet -> (cabinet) -> speakers. Rebuilt whenever the cabinet choice changes. */
  const route = (context: AudioContext, cab: CabinetVariant | null) => {
    const source = node.current;
    if (!source) return;
    source.disconnect();
    convolver.current?.disconnect();
    convolver.current = null;
    if (!cab) {
      source.connect(context.destination);
      return;
    }
    const ir = generateCabinetIr(context.sampleRate, cab);
    const irBuffer = context.createBuffer(1, ir.length, context.sampleRate);
    irBuffer.copyToChannel(ir, 0);
    const conv = context.createConvolver();
    conv.normalize = true;
    conv.buffer = irBuffer;
    source.connect(conv);
    conv.connect(context.destination);
    convolver.current = conv;
  };

  const sendStart = (context: AudioContext) => {
    const { graph: g, outputNode: out, inputGain: gain, sample: s } = latest.current;
    if (!g.inputSourceId || !out) return;
    started.current = { inputSourceId: g.inputSourceId, outputNode: out };
    overloadCount.current = 0;
    post({ type: "start", netlist: g.netlist, inputSourceId: g.inputSourceId, outputNode: out, input: inputLoop(s, context.sampleRate), inputGain: gain });
  };

  const handleMessage = (message: FromEngine) => {
    if (message.type === "error") {
      stop(`실시간 재생을 멈췄습니다: ${message.message}`);
      return;
    }
    setStats({ load: message.load, level: message.level, nonConvergent: message.nonConvergent });
    setSnapshot({ samples: message.snapshot, sampleRate: contextRate.current });
    overloadCount.current = message.load > 1 ? overloadCount.current + 1 : 0;
    if (overloadCount.current >= OVERLOAD_REPORTS) {
      stop(`이 회로는 실시간으로 계산하기에 무겁습니다 (부하 ${Math.round(message.load * 100)}%). 노브 미리듣기를 사용하세요.`);
    }
  };

  const start = async () => {
    const { graph: g, outputNode: out } = latest.current;
    if (!realtimeSupported()) return;
    if (!g.inputSourceId || !out) {
      latest.current.onStatus("실시간 재생에는 입력 소스와 출력 노드가 필요합니다.");
      return;
    }
    const context = getAudioContext();
    contextRate.current = context.sampleRate;
    try {
      moduleLoaded.current ??= context.audioWorklet.addModule(workletUrl);
      await moduleLoaded.current;
      await context.resume();
    } catch (err) {
      moduleLoaded.current = null;
      latest.current.onStatus(`실시간 재생을 시작할 수 없습니다: ${err instanceof Error ? err.message : "알 수 없는 오류"}`);
      return;
    }
    const worklet = new AudioWorkletNode(context, "pedal-realtime", { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1] });
    worklet.port.onmessage = (event: MessageEvent<FromEngine>) => handleMessage(event.data);
    node.current = worklet;
    route(context, latest.current.cabinet);
    sendStart(context);
    setActive(true);
    latest.current.onStatus("실시간 재생 중 - 노브를 돌리면 바로 들립니다.");
  };

  // Edits while playing: values flow straight into the running circuit; a different input source
  // or output node means a different set of solver taps, so that restarts it.
  useEffect(() => {
    if (!active) return;
    if (!graph.inputSourceId || !outputNode) {
      // Paused rather than stopped: it picks up again as soon as both are back.
      if (started.current.outputNode) latest.current.onStatus("입력 소스나 출력 노드가 없어 실시간 재생이 일시 정지되었습니다.");
      post({ type: "stop" });
      started.current = { inputSourceId: "", outputNode: "" };
      return;
    }
    if (graph.inputSourceId !== started.current.inputSourceId || outputNode !== started.current.outputNode) {
      sendStart(latest.current.getAudioContext());
      return;
    }
    post({ type: "netlist", netlist: graph.netlist });
    // stop/sendStart/post only read refs, so they are deliberately left out of the dependencies
    // (here and below): re-running on their identity would resend on every render.
  }, [active, graph, outputNode]);

  useEffect(() => {
    if (active) post({ type: "inputGain", inputGain });
  }, [active, inputGain]);

  useEffect(() => {
    if (active) post({ type: "input", input: inputLoop(sample, latest.current.getAudioContext().sampleRate) });
  }, [active, sample]);

  useEffect(() => {
    if (active) route(latest.current.getAudioContext(), cabinet);
  }, [active, cabinet]);

  useEffect(
    () => () => {
      node.current?.port.postMessage({ type: "stop" } satisfies ToEngine);
      node.current?.disconnect();
      convolver.current?.disconnect();
    },
    [],
  );

  const toggle = () => {
    if (active) stop("실시간 재생을 멈췄습니다.");
    else void start();
  };

  return { supported: realtimeSupported(), active, stats, snapshot, toggle };
}
