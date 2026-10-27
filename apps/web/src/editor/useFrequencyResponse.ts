import { useMemo } from "react";
import { runAcAnalysis, logFrequencySweep, type AcPoint } from "../core/solver/ac";
import type { AcStatus } from "./FrequencyResponseTab";
import type { GraphNetlist } from "./netlistFromGraph";

export interface FrequencyResponseResult {
  points: AcPoint[];
  status: AcStatus;
  error: string | null;
}

const RESPONSE_FREQUENCIES = logFrequencySweep(20, 20000, 40);

/** Live small-signal response at the chosen output node - recomputed on every circuit/param edit,
 * which is what makes knob changes show up on the plot immediately. */
export function useFrequencyResponse(graph: GraphNetlist, outputNode: string): FrequencyResponseResult {
  return useMemo((): FrequencyResponseResult => {
    if (!outputNode) return { points: [], status: "no-output", error: null };
    if (!graph.inputSourceId || graph.netlist.elements.length === 0) return { points: [], status: "no-source", error: null };
    try {
      return {
        points: runAcAnalysis(graph.netlist, { inputSourceId: graph.inputSourceId, outputNode, frequenciesHz: RESPONSE_FREQUENCIES }),
        status: "ok",
        error: null,
      };
    } catch (err) {
      return { points: [], status: "error", error: err instanceof Error ? err.message : "알 수 없는 오류" };
    }
  }, [graph, outputNode]);
}
