import { TransientStream } from "../../core/solver/transient";
import type { FromEngine, ToEngine } from "./protocol";

/** How often stats go back to the editor. */
const STATS_SECONDS = 0.25;
/** Muted, zero-input lead-in after (re)starting from rest, so the bias network charging its
 * coupling capacitors is not played as a thump - and does not teach the auto-gain a false peak. */
const WARMUP_SECONDS = 0.3;
/** Level the automatic gain steers the output's recent peak towards. */
const TARGET_LEVEL = 0.5;
/** Quietest peak the auto-gain will bring up to target: below it the output is treated as silence
 * rather than amplified hiss and rounding noise. */
const GAIN_FLOOR = 0.005;
/** The peak tracker's release: how long a loud passage keeps the gain down after it ends. */
const RELEASE_SECONDS = 1.5;
/** How fast the applied gain follows its target - slow enough not to pump on every note. */
const GAIN_GLIDE_SECONDS = 0.15;
/** DC blocker corner. Circuit outputs often sit on a bias voltage that is inaudible but would clip. */
const DC_BLOCK_HZ = 8;

/**
 * Plays a circuit in real time: the solver as an audio source. It is the AudioWorklet's whole job,
 * kept out of the worklet file so tests can drive it without an AudioContext.
 *
 * The input loops for as long as it plays. Circuit outputs are in volts and vary wildly in level
 * (a buffer vs a fuzz), so the output goes through a DC blocker and a slow automatic gain - this
 * is for hearing what a knob does to the sound, the loudness differences are visible elsewhere.
 */
export class RealtimeEngine {
  private stream: TransientStream | null = null;
  private input: Float32Array = new Float32Array(0);
  private inputGain = 1;
  private position = 0;
  private warmupLeft = 0;
  private readonly tap = new Float64Array(1);
  private dcIn = 0;
  private dcOut = 0;
  private peak = 0;
  private gain = 1;
  private readonly dcCoefficient: number;
  private readonly releaseCoefficient: number;
  private readonly glideCoefficient: number;
  private statsSamples = 0;
  private statsBusy = 0;
  private statsLevel = 0;
  private reportedNonConvergent = 0;
  private readonly statsWindow: number;
  private readonly pending: FromEngine[] = [];

  private readonly sampleRate: number;
  private readonly now: () => number;

  constructor(sampleRate: number, now: () => number) {
    this.sampleRate = sampleRate;
    this.now = now;
    this.dcCoefficient = Math.exp((-2 * Math.PI * DC_BLOCK_HZ) / sampleRate);
    this.releaseCoefficient = Math.exp(-1 / (RELEASE_SECONDS * sampleRate));
    this.glideCoefficient = 1 - Math.exp(-1 / (GAIN_GLIDE_SECONDS * sampleRate));
    this.statsWindow = Math.round(STATS_SECONDS * sampleRate);
  }

  get playing(): boolean {
    return this.stream !== null;
  }

  handle(message: ToEngine): void {
    try {
      switch (message.type) {
        case "start":
          this.input = message.input;
          this.inputGain = message.inputGain;
          this.position = 0;
          this.stream = new TransientStream(message.netlist, {
            inputSourceId: message.inputSourceId,
            sampleRate: this.sampleRate,
            tapNodes: [message.outputNode],
          });
          this.restartFromRest();
          break;
        case "netlist":
          if (!this.stream) return;
          this.stream.replaceNetlist(message.netlist);
          break;
        case "inputGain":
          this.inputGain = message.inputGain;
          break;
        case "input":
          this.input = message.input;
          this.position = 0;
          break;
        case "stop":
          this.stream = null;
          break;
      }
    } catch (err) {
      this.stream = null;
      this.pending.push({ type: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }

  private restartFromRest() {
    this.stream?.reset();
    this.warmupLeft = Math.round(WARMUP_SECONDS * this.sampleRate);
    this.dcIn = 0;
    this.dcOut = 0;
    this.peak = 0;
    this.gain = 1;
    this.reportedNonConvergent = 0;
  }

  /** Fills one render quantum. Silence when stopped. */
  render(out: Float32Array): void {
    const stream = this.stream;
    if (!stream || this.input.length === 0) {
      out.fill(0);
      return;
    }
    const started = this.now();
    const { input, tap } = this;
    for (let i = 0; i < out.length; i++) {
      let curr = 0;
      let next = 0;
      const warming = this.warmupLeft > 0;
      if (!warming) {
        curr = input[this.position] * this.inputGain;
        next = input[(this.position + 1) % input.length] * this.inputGain;
        this.position = (this.position + 1) % input.length;
      }
      stream.advance(curr, next, tap);
      const volts = tap[0];
      if (!Number.isFinite(volts)) {
        // A blown-up solve: start over from rest rather than play (or keep integrating) garbage.
        out[i] = 0;
        this.restartFromRest();
        continue;
      }
      // One-pole/one-zero DC blocker.
      const blocked = volts - this.dcIn + this.dcCoefficient * this.dcOut;
      this.dcIn = volts;
      this.dcOut = blocked;
      if (warming) {
        this.warmupLeft--;
        out[i] = 0;
        continue;
      }
      const magnitude = Math.abs(blocked);
      this.peak = Math.max(magnitude, this.peak * this.releaseCoefficient);
      const target = TARGET_LEVEL / Math.max(this.peak, GAIN_FLOOR);
      this.gain += (target - this.gain) * this.glideCoefficient;
      // Only reached on a sudden jump the glide has not caught up with yet: saturate softly
      // instead of clipping hard.
      const y = Math.tanh(blocked * this.gain);
      out[i] = y;
      this.statsLevel = Math.max(this.statsLevel, Math.abs(y));
    }
    this.statsBusy += this.now() - started;
    this.statsSamples += out.length;
    if (this.statsSamples >= this.statsWindow) {
      const audioMs = (this.statsSamples / this.sampleRate) * 1000;
      this.pending.push({
        type: "stats",
        load: this.statsBusy / audioMs,
        nonConvergent: stream.nonConvergentSampleCount - this.reportedNonConvergent,
        level: this.statsLevel,
      });
      this.reportedNonConvergent = stream.nonConvergentSampleCount;
      this.statsSamples = 0;
      this.statsBusy = 0;
      this.statsLevel = 0;
    }
  }

  /** Messages produced since the last call (stats, errors), for the worklet to post. */
  drain(): FromEngine[] {
    return this.pending.splice(0, this.pending.length);
  }
}

/** Linear resampling of the input loop to the audio context's rate - quality is plenty for a
 * guitar loop, and it only runs once per (re)start. */
export function resampleLinear(samples: ArrayLike<number>, fromRate: number, toRate: number): Float32Array {
  if (samples.length === 0) return new Float32Array(0);
  if (fromRate === toRate) return Float32Array.from(samples);
  const length = Math.max(1, Math.round((samples.length * toRate) / fromRate));
  const out = new Float32Array(length);
  const step = fromRate / toRate;
  for (let i = 0; i < length; i++) {
    const at = i * step;
    const k = Math.floor(at);
    const frac = at - k;
    const a = samples[Math.min(k, samples.length - 1)];
    const b = samples[Math.min(k + 1, samples.length - 1)];
    out[i] = a + (b - a) * frac;
  }
  return out;
}
