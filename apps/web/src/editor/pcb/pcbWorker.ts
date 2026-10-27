import { generatePcb } from "./pcbRoute";
import type { BoardNetlist } from "./boardNetlist";
import type { PcbLayout, PcbRules, Point } from "./pcbTypes";

export interface PcbWorkerRequest {
  board: BoardNetlist;
  partPos: [string, Point][];
  rules: PcbRules;
}

export type PcbWorkerResponse = { layout: PcbLayout } | { error: string };

self.onmessage = (event: MessageEvent<PcbWorkerRequest>) => {
  const { board, partPos, rules } = event.data;
  try {
    const layout = generatePcb(board, new Map(partPos), rules);
    (self as unknown as Worker).postMessage({ layout } satisfies PcbWorkerResponse);
  } catch (err) {
    (self as unknown as Worker).postMessage({ error: err instanceof Error ? err.message : String(err) } satisfies PcbWorkerResponse);
  }
};
