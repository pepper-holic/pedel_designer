import { useEffect, useRef, useState } from "react";
import { runTransientAsync } from "../core/solver/runTransientAsync";
import { playSamples } from "../audio/playback";
import { previewClip, applyEdgeFades } from "../audio/previewClip";
import type { CabinetVariant } from "../audio/cabinetIr";
import type { LoadedSample } from "../audio/loadSample";
import type { GraphNetlist } from "./netlistFromGraph";

/** How long values must stay put before a preview starts - "the knob was let go". Short enough to
 * feel immediate, long enough that dragging a slider does not queue a solve per pixel. */
const SETTLE_MS = 300;
const STORAGE_KEY = "pedal-designer:knob-preview";

function readEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

interface KnobPreviewOptions {
  graph: GraphNetlist;
  outputNode: string;
  inputGain: number;
  sample: LoadedSample | null;
  getAudioContext: () => AudioContext;
  cabinet: CabinetVariant | null;
  onStatus: (message: string) => void;
}

/**
 * "Turn a knob, hear it": after a parameter change settles, simulates a short clip through the
 * current circuit (1x, no oversampling - this is about the change, not the last bit of accuracy)
 * and plays it. A newer change cancels both the solve in flight and the clip still playing, so only
 * the latest setting is ever heard.
 *
 * This is the stopgap the plan (Stage D-0) puts in front of real-time audio: it works at today's
 * solver speed because the clip is short.
 */
export function useKnobPreview({ graph, outputNode, inputGain, sample, getAudioContext, cabinet, onStatus }: KnobPreviewOptions) {
  const [enabled, setEnabledState] = useState(readEnabled);
  const [busy, setBusy] = useState(false);
  /** The last clip played, in volts - what the player view's spectrum shows without live audio. */
  const [lastClip, setLastClip] = useState<{ samples: Float64Array; sampleRate: number } | null>(null);
  const latest = useRef({ graph, outputNode, inputGain, sample, cabinet });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abort = useRef<AbortController | null>(null);
  const playing = useRef<AudioBufferSourceNode | null>(null);

  useEffect(() => {
    latest.current = { graph, outputNode, inputGain, sample, cabinet };
  });

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      abort.current?.abort();
    },
    [],
  );

  const stopPlaying = () => {
    try {
      playing.current?.stop();
    } catch {
      // already ended
    }
    playing.current = null;
  };

  const run = async () => {
    const { graph: g, outputNode: out, inputGain: gain, sample: s, cabinet: cab } = latest.current;
    if (!out || !g.inputSourceId) return;
    // No worker or audio output (tests, very old browsers): previews are a nicety, so just skip.
    if (typeof Worker === "undefined" || typeof AudioContext === "undefined") return;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    const context = getAudioContext();
    const clip = previewClip(s, context.sampleRate);
    const input = new Float64Array(clip.samples.length);
    for (let i = 0; i < input.length; i++) input[i] = clip.samples[i] * gain;

    setBusy(true);
    const t0 = performance.now();
    try {
      const { traces } = await runTransientAsync(
        g.netlist,
        { inputSourceId: g.inputSourceId, inputSamples: input, sampleRate: clip.sampleRate, tapNodes: [out] },
        controller.signal,
      );
      const data = traces.get(out);
      if (!data || controller.signal.aborted) return;
      stopPlaying();
      setLastClip({ samples: data, sampleRate: clip.sampleRate });
      playing.current = playSamples(applyEdgeFades(data, clip.sampleRate), clip.sampleRate, context, cab);
      onStatus(`미리듣기 재생 (계산 ${((performance.now() - t0) / 1000).toFixed(2)}초)`);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      onStatus(`미리듣기 실패: ${err instanceof Error ? err.message : "알 수 없는 오류"}`);
    } finally {
      if (abort.current === controller) {
        abort.current = null;
        setBusy(false);
      }
    }
  };

  /** Call after any knob/value edit. Restarts the settle timer, so only the final value plays. */
  const request = () => {
    if (!enabled) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      void run();
    }, SETTLE_MS);
  };

  const setEnabled = (on: boolean) => {
    setEnabledState(on);
    try {
      localStorage.setItem(STORAGE_KEY, on ? "on" : "off");
    } catch {
      // private mode etc. - the toggle still works for this session
    }
    if (!on) {
      if (timer.current) clearTimeout(timer.current);
      abort.current?.abort();
      stopPlaying();
    }
  };

  return { enabled, setEnabled, busy, request, lastClip };
}
