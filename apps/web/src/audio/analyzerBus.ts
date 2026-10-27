/**
 * The real-time analyzer's input (RTA): two AnalyserNodes - `pre` (what goes into the circuit) and
 * `post` (what comes out) - that every way of hearing the circuit feeds while it plays: real-time
 * playback, result playback, knob previews. Fed in volts, not in what the speakers get (playback is
 * normalised, real-time output is auto-gained), so post above pre is the circuit's real gain.
 *
 * One bus per AudioContext; the app has one context, and whoever draws the analyzer finds it with
 * `currentAnalyzerBus` and hears about playback starting and stopping through `onAnalyzerActivity`.
 */

export interface AnalyzerBus {
  context: AudioContext;
  pre: AnalyserNode;
  post: AnalyserNode;
  /** Sources currently feeding the bus. */
  active: number;
}

/** AnalyserNode applies a Blackman window and divides by the frame length; this brings its dB to
 * the same scale as `computeSpectrum` (a 1V-peak sine reads 0dB): x2 for single-sided, /0.42 for
 * the window's coherent gain. */
export const ANALYSER_TO_PEAK_DB = 20 * Math.log10(2 / 0.42);

let bus: AnalyzerBus | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

export function analyzerBus(context: AudioContext): AnalyzerBus {
  if (bus && bus.context === context) return bus;
  const make = () => {
    const node = context.createAnalyser();
    node.fftSize = 16384;
    // Averaging is done by the analyzer view, in power and per display point.
    node.smoothingTimeConstant = 0;
    return node;
  };
  bus = { context, pre: make(), post: make(), active: 0 };
  notify();
  return bus;
}

export function currentAnalyzerBus(): AnalyzerBus | null {
  return bus;
}

/** Called whenever playback starts or stops feeding the bus (or a bus first appears). */
export function onAnalyzerActivity(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Marks a source as feeding the bus; call the returned function (once) when it stops. */
export function beginActivity(target: AnalyzerBus): () => void {
  target.active++;
  notify();
  let ended = false;
  return () => {
    if (ended) return;
    ended = true;
    target.active = Math.max(0, target.active - 1);
    notify();
  };
}

export interface MonitorSignals {
  /** The circuit's input, in volts. */
  pre?: ArrayLike<number>;
  /** The circuit's output (or a probed point), in volts. */
  post?: ArrayLike<number>;
}

/**
 * Plays `signals` into the analyzer only (silently), starting at `when` on the context's clock -
 * alongside the audible playback of the same material. Returns a stop function.
 */
export function monitorSignals(context: AudioContext, signals: MonitorSignals, sampleRate: number, when: number): () => void {
  const target = analyzerBus(context);
  const sources: AudioBufferSourceNode[] = [];
  for (const [key, data] of Object.entries(signals) as [keyof MonitorSignals, ArrayLike<number> | undefined][]) {
    if (!data || data.length === 0) continue;
    const buffer = context.createBuffer(1, data.length, sampleRate);
    buffer.copyToChannel(Float32Array.from(data), 0);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(target[key]);
    source.start(when);
    sources.push(source);
  }
  if (sources.length === 0) return () => {};
  const end = beginActivity(target);
  let remaining = sources.length;
  for (const source of sources) {
    source.onended = () => {
      if (--remaining === 0) end();
    };
  }
  return () => {
    for (const source of sources) {
      try {
        source.stop();
      } catch {
        // already stopped
      }
    }
    end();
  };
}
