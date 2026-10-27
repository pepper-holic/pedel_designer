import { generatePcb } from "./pcbRoute";
import type { BoardNetlist } from "./boardNetlist";
import type { PcbLayout, PcbRules, Point } from "./pcbTypes";
import type { PcbWorkerRequest, PcbWorkerResponse } from "./pcbWorker";

/** Places and routes off the main thread - a busy board takes a couple of seconds. Runs inline
 * where there are no workers (tests). */
export function generatePcbAsync(board: BoardNetlist, partPos: Map<string, Point>, rules: PcbRules): Promise<PcbLayout> {
  if (typeof Worker === "undefined") return Promise.resolve().then(() => generatePcb(board, partPos, rules));
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./pcbWorker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<PcbWorkerResponse>) => {
      worker.terminate();
      if ("layout" in event.data) resolve(event.data.layout);
      else reject(new Error(event.data.error));
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(event.error instanceof Error ? event.error : new Error(event.message));
    };
    worker.postMessage({ board, partPos: [...partPos], rules } satisfies PcbWorkerRequest);
  });
}
