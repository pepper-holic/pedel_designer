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

export function hasBreakdown(el: DiodeElement): boolean {
  return el.breakdownVoltage !== undefined && el.breakdownVoltage > 0;
}

/** SPICE's default IBV: the reverse current that defines where the breakdown voltage is measured. */
const DEFAULT_BREAKDOWN_CURRENT = 1e-3;

/**
 * Junction current and conductance at vd, forward exponential plus, with a breakdown voltage, the reverse (zener) exponential
 * mirrored about -bv: i = Is*(exp(vd/veff) - 1) - Ibv*exp(-(vd + bv)/veff). The same emission coefficient is used both ways,
 * so a 3.3V part gets about 0.11V per decade of reverse current - a soft knee, as the low-voltage zeners really have.
 */
export function junctionCurrent(el: DiodeElement, vd: number): { current: number; conductance: number } {
  const veff = el.emissionCoefficient * el.thermalVoltage;
  const forward = el.saturationCurrent * (Math.exp(vd / veff) - 1);
  let current = forward;
  let conductance = (forward + el.saturationCurrent) / veff;
  if (hasBreakdown(el)) {
    const reverse = (el.breakdownCurrent ?? DEFAULT_BREAKDOWN_CURRENT) * Math.exp(-(vd + el.breakdownVoltage!) / veff);
    current -= reverse;
    conductance += reverse / veff;
  }
  return { current, conductance };
}

/** Junction voltage limiting in both directions: the forward knee as usual and, for a breakdown diode, the mirrored knee at -bv
 * (the reverse exponential blows up just like the forward one when Newton overshoots past it). */
function limitJunction(el: DiodeElement, vnew: number, vold: number): number {
  const veff = el.emissionCoefficient * el.thermalVoltage;
  const limited = limitVoltage(vnew, vold, veff, criticalVoltage(el.saturationCurrent, veff));
  if (!hasBreakdown(el)) return limited;
  const bv = el.breakdownVoltage!;
  const ibv = el.breakdownCurrent ?? DEFAULT_BREAKDOWN_CURRENT;
  const mirrored = limitVoltage(-(limited + bv), -(vold + bv), veff, criticalVoltage(ibv, veff));
  return -bv - mirrored;
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
  const useRs = hasSeriesResistance(el);
  const junctionNodeId = useRs ? seriesNodeId(el.id) : el.nodes[0];
  const junctionP = useRs ? nodeOf(ctx.topology, junctionNodeId) : p;

  if (useRs) ctx.system.stampConductance(p, junctionP, 1 / el.seriesResistance!);

  const vdRaw = voltageAt(ctx.topology, ctx.solutionGuess, junctionNodeId) - voltageAt(ctx.topology, ctx.solutionGuess, el.nodes[1]);
  const ref = ctx.limitReference;
  const vold = ctx.limitState.get(el.id) ?? (ref ? voltageAt(ctx.topology, ref, junctionNodeId) - voltageAt(ctx.topology, ref, el.nodes[1]) : 0);
  const vd = limitJunction(el, vdRaw, vold);
  ctx.limitState.set(el.id, vd);

  const { current: id, conductance } = junctionCurrent(el, vd);
  const geq = conductance + GMIN;
  const ieq = id - geq * vd;

  ctx.system.stampConductance(junctionP, n, geq);
  ctx.system.stampCurrentSource(n, junctionP, ieq);
}
