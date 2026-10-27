import type { TransientOptions, TransientResult } from "./transient";
import type { Netlist, NodeId } from "./types";
import type { TransientWorkerRequest, TransientWorkerResponse } from "./transientWorker";

/**
 * Same result as `runTransient`, but run on a Web Worker so a long user-uploaded audio file doesn't
 * freeze the page while it simulates (see docs/ROADMAP.md §6 - the main-thread-blocking risk the
 * simulation core audit flagged). A fresh worker per call is simpler than pooling one, and this is
 * only invoked on explicit user actions (Run, not per-keystroke), so the spin-up cost is fine.
 */
export function runTransientAsync(netlist: Netlist, options: TransientOptions, signal?: AbortSignal): Promise<TransientResult> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("aborted", "AbortError"));
      return;
    }
    const worker = new Worker(new URL("./transientWorker.ts", import.meta.url), { type: "module" });
    // Superseded runs (a knob moved again before the last preview finished) are killed outright -
    // the solve is synchronous inside the worker, so terminating is the only way to stop it.
    signal?.addEventListener(
      "abort",
      () => {
        worker.terminate();
        reject(new DOMException("aborted", "AbortError"));
      },
      { once: true },
    );

    worker.onmessage = (event: MessageEvent<TransientWorkerResponse>) => {
      const traces = new Map<NodeId, Float64Array>(event.data.traces);
      resolve({ traces, nonConvergentSampleCount: event.data.nonConvergentSampleCount, worstNonConvergentDelta: event.data.worstNonConvergentDelta });
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
