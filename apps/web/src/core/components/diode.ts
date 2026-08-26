import { nodeOf } from "../solver/topology";
import { voltageAt } from "../solver/solution";
import type { DiodeElement } from "../solver/types";
import type { StampContext } from "./context";
import { criticalVoltage, limitVoltage } from "./junction";

/** Small parallel conductance added to every diode so the matrix never goes singular when reverse-biased. */
const GMIN = 1e-12;

export function seriesNodeId(elementId: string): string {
  return `${elementId}::rs`;
}

export function hasSeriesResistance(el: DiodeElement): boolean {
  return el.seriesResistance !== undefined && el.seriesResistance > 0;
}

/**
 * Diode stamp. When `seriesResistance` is set, an internal node models the bulk/lead resistance
 * as a plain linear resistor between the anode and the junction, so the current equation below
 * sees a "clean" junction voltage and the series drop shows up only via that resistor - improving
 * accuracy in the forward high-current knee region without changing the junction equation itself.
 */
export function stampDiode(el: DiodeElement, ctx: StampContext): void {
  const p = nodeOf(ctx.topology, el.nodes[0]);
  const n = nodeOf(ctx.topology, el.nodes[1]);
  const { saturationCurrent: is, thermalVoltage: vt, emissionCoefficient: nFactor } = el;
  const veff = nFactor * vt;

  const useRs = hasSeriesResistance(el);
  const junctionNodeId = useRs ? seriesNodeId(el.id) : el.nodes[0];
  const junctionP = useRs ? nodeOf(ctx.topology, junctionNodeId) : p;

  if (useRs) ctx.system.stampConductance(p, junctionP, 1 / el.seriesResistance!);

  const vdRaw = voltageAt(ctx.topology, ctx.solutionGuess, junctionNodeId) - voltageAt(ctx.topology, ctx.solutionGuess, el.nodes[1]);
  const vold = ctx.limitState.get(el.id) ?? 0;
  const vd = limitVoltage(vdRaw, vold, veff, criticalVoltage(is, veff));
  ctx.limitState.set(el.id, vd);

  const id = is * (Math.exp(vd / veff) - 1);
  const geq = (id + is) / veff + GMIN;
  const ieq = id - geq * vd;

  ctx.system.stampConductance(junctionP, n, geq);
  ctx.system.stampCurrentSource(n, junctionP, ieq);
}
