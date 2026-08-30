import type { TransientOptions, TransientResult } from "./transient";
import type { Netlist, NodeId } from "./types";
import type { TransientWorkerRequest, TransientWorkerResponse } from "./transientWorker";

/**
 * Same result as `runTransient`, but run on a Web Worker so a long user-uploaded audio file doesn't
 * freeze the page while it simulates (see docs/ROADMAP.md §6 - the main-thread-blocking risk the
 * simulation core audit flagged). A fresh worker per call is simpler than pooling one, and this is
 * only invoked on explicit user actions (Run, not per-keystroke), so the spin-up cost is fine.
 */
export function runTransientAsync(netlist: Netlist, options: TransientOptions): Promise<TransientResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./transientWorker.ts", import.meta.url), { type: "module" });

    worker.onmessage = (event: MessageEvent<TransientWorkerResponse>) => {
      const traces = new Map<NodeId, Float64Array>(event.data.traces);
      resolve({ traces, nonConvergentSampleCount: event.data.nonConvergentSampleCount });
      worker.terminate();
    };
    worker.onerror = (event) => {
      reject(event.error instanceof Error ? event.error : new Error(event.message));
      worker.terminate();
    };

    const request: TransientWorkerRequest = { netlist, options };
    worker.postMessage(request);
  });
}
