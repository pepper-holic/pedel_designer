import { RealtimeEngine } from "./realtimeEngine";
import type { ToEngine } from "./protocol";

// AudioWorkletGlobalScope - not part of the DOM lib this project compiles against.
declare const sampleRate: number;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}
declare function registerProcessor(name: string, processor: new () => AudioWorkletProcessor): void;

/** Not every browser exposes `performance` inside a worklet; Date.now is coarser but is always
 * there, and the load figure is an average over a quarter second anyway. */
const now = typeof performance !== "undefined" ? () => performance.now() : () => Date.now();

class PedalRealtimeProcessor extends AudioWorkletProcessor {
  private readonly engine = new RealtimeEngine(sampleRate, now);

  constructor() {
    super();
    this.port.onmessage = (event: MessageEvent<ToEngine>) => this.engine.handle(event.data);
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const channels = outputs[0];
    if (channels && channels.length > 0) {
      this.engine.render(channels[0]);
      for (let c = 1; c < channels.length; c++) channels[c].set(channels[0]);
    }
    for (const message of this.engine.drain()) this.port.postMessage(message);
    return true;
  }
}

registerProcessor("pedal-realtime", PedalRealtimeProcessor);
