import { runAcAnalysis, type AcPoint } from "../core/solver/ac";
import { netlistFromGraph } from "./netlistFromGraph";
import { PART_DEFS, type PartType } from "./partDefs";
import type { PartInstance, Wire } from "./types";

/** Knob positions a pot is swept through - the ends plus the quarter marks, which is how a player
 * describes a setting ("on 7") rather than an arbitrary number of samples. */
const POT_SWEEP_VALUES = [0, 0.25, 0.5, 0.75, 1];

/** How many detents each switch type has, for sweeping every real position and no more. */
const SWITCH_POSITION_COUNTS: Partial<Record<PartType, number>> = {
  spst: 2,
  spdt: 2,
  dpdt: 2,
  blade3: 3,
  blade5: 5,
  rotary6: 6,
};

export interface SweepTarget {
  partId: string;
  /** Human-readable name for the control, e.g. "TONE (포텐셔미터)". */
  label: string;
  paramKey: string;
  values: number[];
  /** Text for each value, in the same order - "0%".."100%" for a pot, detent names for a switch. */
  valueLabels: string[];
}

export interface SweepCurve {
  value: number;
  label: string;
  points: AcPoint[];
}

/**
 * The controls on this canvas worth sweeping: every potentiometer and every switch. Ordinary
 * component values are deliberately excluded - a resistor has no "positions", and sweeping it would
 * be asking a different question (tolerance), which the Monte Carlo panel already answers.
 */
export function sweepCandidates(parts: PartInstance[]): SweepTarget[] {
  const targets: SweepTarget[] = [];
  for (const part of parts) {
    if (part.type === "potentiometer") {
      targets.push({
        partId: part.id,
        label: `${part.id} (${PART_DEFS[part.type].label})`,
        paramKey: "position",
        values: POT_SWEEP_VALUES,
        valueLabels: POT_SWEEP_VALUES.map((v) => `${Math.round(v * 100)}%`),
      });
      continue;
    }
    const positionCount = SWITCH_POSITION_COUNTS[part.type];
    if (positionCount === undefined) continue;
    const values = Array.from({ length: positionCount }, (_, i) => i);
    targets.push({
      partId: part.id,
      label: `${part.id} (${PART_DEFS[part.type].label})`,
      paramKey: "switchPosition",
      values,
      valueLabels: values.map((v) => `${v + 1}단`),
    });
  }
  return targets;
}

/**
 * Runs one AC analysis per swept value so the curves can be drawn on top of each other.
 *
 * `outputNode` is a net name picked in the *base* circuit, but a switch sweep rewires the circuit
 * at every step and net names are assigned per graph. So the net is anchored back to a terminal
 * once, and that terminal is re-resolved on each step - otherwise sweeping a selector would either
 * plot the wrong node or lose the output entirely.
 */
export function sweepParameter(
  parts: PartInstance[],
  wires: Wire[],
  outputNode: string,
  target: SweepTarget,
  frequenciesHz: number[],
): SweepCurve[] {
  const baseGraph = netlistFromGraph(parts, wires);
  const anchorTerminal = [...baseGraph.terminalNet.entries()].find(([, net]) => net === outputNode)?.[0];
  if (!anchorTerminal) return [];

  const curves: SweepCurve[] = [];
  target.values.forEach((value, i) => {
    const swept = parts.map((p) => (p.id === target.partId ? { ...p, params: { ...p.params, [target.paramKey]: value } } : p));
    const graph = netlistFromGraph(swept, wires);
    const node = graph.terminalNet.get(anchorTerminal);
    if (!node || !graph.inputSourceId) return;
    curves.push({
      value,
      label: target.valueLabels[i],
      points: runAcAnalysis(graph.netlist, { inputSourceId: graph.inputSourceId, outputNode: node, frequenciesHz }),
    });
  });
  return curves;
}
