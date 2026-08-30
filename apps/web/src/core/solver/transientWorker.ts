import { runTransient, type TransientOptions, type TransientResult } from "./transient";
import type { Netlist } from "./types";

export interface TransientWorkerRequest {
  netlist: Netlist;
  options: TransientOptions;
}

export type TransientWorkerResponse = { traces: [string, Float64Array][]; nonConvergentSampleCount: number };

/** Runs the same `runTransient` the main thread would, off the UI thread - a large user-uploaded
 * audio file can be hundreds of thousands of samples, each needing its own Newton solve, which is
 * enough synchronous work to freeze the page if run inline (see docs/ROADMAP.md §6). `Map` isn't
 * structured-clonable in every environment this worker might run under, so traces are sent back as
 * a plain array of [nodeId, Float64Array] pairs instead. */
self.onmessage = (event: MessageEvent<TransientWorkerRequest>) => {
  const { netlist, options } = event.data;
  const result: TransientResult = runTransient(netlist, options);
  const response: TransientWorkerResponse = {
    traces: Array.from(result.traces.entries()),
    nonConvergentSampleCount: result.nonConvergentSampleCount,
  };
  const transferables = response.traces.map(([, data]) => data.buffer);
  (self as unknown as Worker).postMessage(response, transferables);
};
