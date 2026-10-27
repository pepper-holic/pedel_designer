import { useMemo } from "react";
import { runAcAnalysisMulti, logFrequencySweep, type AcPoint } from "../core/solver/ac";
import type { AcStatus } from "./FrequencyResponseTab";
import type { GraphNetlist } from "./netlistFromGraph";
import type { ResolvedProbe } from "./probes";
import type { ResponseSeries } from "../viz/FrequencyResponse";

export interface FrequencyResponseResult {
  /** Response at the chosen output node (empty when none is chosen). */
  points: AcPoint[];
  /** One curve per probe, in probe colour - empty when there are no probes. */
  probeSeries: ResponseSeries[];
  status: AcStatus;
  error: string | null;
}

const RESPONSE_FREQUENCIES = logFrequencySweep(20, 20000, 40);

/**
 * Live small-signal response at the output node and at every probe - recomputed on every
 * circuit/param edit, which is what makes knob changes show up on the plot immediately. All nodes
 * come out of one sweep (the complex solve already holds every node's voltage).
 */
export function useFrequencyResponse(graph: GraphNetlist, outputNode: string, probes: ResolvedProbe[] = []): FrequencyResponseResult {
  return useMemo((): FrequencyResponseResult => {
    if (!outputNode && probes.length === 0) return { points: [], probeSeries: [], status: "no-output", error: null };
    if (!graph.inputSourceId || graph.netlist.elements.length === 0) return { points: [], probeSeries: [], status: "no-source", error: null };
    try {
      const nodes = [...new Set([...(outputNode ? [outputNode] : []), ...probes.map((p) => p.net)])];
      const byNode = runAcAnalysisMulti(graph.netlist, { inputSourceId: graph.inputSourceId, outputNodes: nodes, frequenciesHz: RESPONSE_FREQUENCIES });
      return {
        points: outputNode ? byNode.get(outputNode)! : [],
        probeSeries: probes.map((p) => ({ label: p.label, points: byNode.get(p.net)!, color: p.color })),
        status: "ok",
        error: null,
      };
    } catch (err) {
      return { points: [], probeSeries: [], status: "error", error: err instanceof Error ? err.message : "알 수 없는 오류" };
    }
  }, [graph, outputNode, probes]);
}
