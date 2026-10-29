import { branchOf, nodeOf } from "../solver/topology";
import type { OpAmpElement } from "../solver/types";
import type { StampContext } from "./context";

/** Internal companion capacitance (F) used to realize the GBWP integrator pole. Chosen small so its
 * admittance stays in the same numeric range as typical circuit resistors (better matrix conditioning
 * than an arbitrary unit capacitance would give). */
export const POLE_CAPACITANCE = 1e-9;

/** Floor for the clamp slope in the Newton stamp of a rail-clipped amplifier (see stampClippedAmplifier). */
const MIN_NEWTON_SLOPE = 1e-4;

export function poleNodeId(elementId: string): string {
  return `${elementId}::pole`;
}

export function bufferBranchId(elementId: string): string {
  return `${elementId}:buffer`;
}

export function hasRailClipping(el: OpAmpElement): boolean {
  return el.railPositive !== undefined && el.railNegative !== undefined && el.railPositive > el.railNegative;
}

export function hasGbwp(el: OpAmpElement): boolean {
  return el.gbwpHz !== undefined && el.gbwpHz > 0;
}

/** Whether this op-amp needs the internal GBWP "pole" node (only the integrator stage uses one -
 * rail clipping without GBWP clips the amplified error signal directly, no extra node required). */
export function needsInternalNode(el: OpAmpElement): boolean {
  return hasGbwp(el);
}

/** Transconductance (A/V) that gives the internal integrator a unity-gain frequency of gbwpHz. */
export function integratorGm(gbwpHz: number): number {
  return 2 * Math.PI * gbwpHz * POLE_CAPACITANCE;
}

/** Smooth rail-to-rail clamp and its derivative, used to Newton-linearize the clipped output stage. */
function clampToRails(v: number, railPositive: number, railNegative: number): { value: number; slope: number } {
  const center = (railPositive + railNegative) / 2;
  const halfRange = (railPositive - railNegative) / 2;
  const x = (v - center) / halfRange;
  const t = Math.tanh(x);
  return { value: center + halfRange * t, slope: 1 - t * t };
}

/**
 * Newton step limiting for the clamp's input, like junction limiting for a diode: between iterations
 * of one solve the value the clamp is evaluated at may move by at most the rails' half-range. Without
 * it a high-gain stage whose input error is a few millivolts jumps from one rail's flat region to the
 * other's on every iteration and never settles (a TL072 follower biased at 4.5V on a 9V supply). At
 * convergence the input stops moving, so the limited value equals the true one and the answer is
 * unchanged.
 */
function limitClampInput(ctx: StampContext, key: string, x: number, el: OpAmpElement): number {
  const step = (el.railPositive! - el.railNegative!) / 2;
  const prev = ctx.limitState.get(key);
  const limited = prev === undefined ? x : prev + Math.max(-step, Math.min(step, x - prev));
  ctx.limitState.set(key, limited);
  return limited;
}

/** Just the derivative of `clampToRails`, for AC small-signal analysis frozen at a DC bias point. */
export function clipSlope(v: number, railPositive: number, railNegative: number): number {
  return clampToRails(v, railPositive, railNegative).slope;
}

/**
 * Op-amp stamp, in increasing order of non-ideality:
 * - baseline (no gbwpHz, no rails): ideal nullor, forces V(in+) = V(in-), unchanged from before.
 * - rails only: a Newton-linearized "clipped amplifier" branch enforces
 *   V(out) = clamp(openLoopGain * (V(in+) - V(in-)), rails) directly - no extra node needed.
 * - gbwpHz set: a VCCS + capacitor companion model realizes a single-pole integrator on an internal
 *   "pole" node (dV(pole)/dt = 2*pi*gbwpHz*(V(in+)-V(in-))), and an output branch copies (or, if
 *   rails are also set, clips) that pole voltage onto the real output node.
 */
export function stampOpAmp(el: OpAmpElement, ctx: StampContext): void {
  const inPlus = nodeOf(ctx.topology, el.nodes[0]);
  const inMinus = nodeOf(ctx.topology, el.nodes[1]);
  const out = nodeOf(ctx.topology, el.nodes[2]);

  if (!hasGbwp(el)) {
    if (!hasRailClipping(el)) {
      const branch = branchOf(ctx.topology, el.id);
      ctx.system.stampIdealOpAmp(branch, inPlus, inMinus, out);
    } else {
      const branch = branchOf(ctx.topology, el.id);
      stampClippedAmplifier(el, branch, inPlus, inMinus, out, ctx);
    }
    return;
  }

  const pole = nodeOf(ctx.topology, poleNodeId(el.id));
  stampGbwpIntegrator(el, pole, inPlus, inMinus, ctx);

  const bufferBranch = branchOf(ctx.topology, bufferBranchId(el.id));
  if (hasRailClipping(el)) {
    stampClippedBuffer(el, bufferBranch, pole, out, ctx);
  } else {
    ctx.system.stampVoltageSource(bufferBranch, out, pole, 0);
  }
}

/** VCCS + capacitor companion model realizing dV(pole)/dt = 2*pi*gbwpHz*(V(in+) - V(in-)), i.e. a
 * single-pole integrator with unity-gain frequency gbwpHz - the standard SPICE macromodel trick for
 * a finite gain-bandwidth-product op-amp. Purely linear: no Newton nonlinearity involved. */
function stampGbwpIntegrator(el: OpAmpElement, pole: number, inPlus: number, inMinus: number, ctx: StampContext): void {
  if (ctx.dt <= 0) {
    // DC operating point: approximate with a large-but-finite gain (no cap "memory" at a single
    // algebraic solve) so V(pole) tracks (in+ - in-), just enough to give the rail-clip stage a
    // sensible bias point to linearize around.
    const gm = integratorGm(el.gbwpHz!) * 1e6;
    ctx.system.stampMatrixEntry(pole, pole, 1);
    ctx.system.stampMatrixEntry(pole, inPlus, -gm);
    ctx.system.stampMatrixEntry(pole, inMinus, gm);
    return;
  }

  const gm = integratorGm(el.gbwpHz!);
  const geq = POLE_CAPACITANCE / ctx.dt;
  const historyKey = poleNodeId(el.id);
  const prevVoltage = ctx.history.get(historyKey) ?? 0;

  ctx.system.stampConductance(pole, -1, geq);
  ctx.system.stampCurrentSource(pole, -1, geq * prevVoltage);
  ctx.system.stampMatrixEntry(pole, inPlus, -gm);
  ctx.system.stampMatrixEntry(pole, inMinus, gm);
}

/** Nonlinear (Newton-linearized) output buffer implementing V(out) = clamp(V(pole), rails). */
function stampClippedBuffer(el: OpAmpElement, branch: number, pole: number, out: number, ctx: StampContext): void {
  const guess = limitClampInput(ctx, `${el.id}:pole`, pole >= 0 ? ctx.solutionGuess[pole] : 0, el);
  const { value, slope: trueSlope } = clampToRails(guess, el.railPositive!, el.railNegative!);
  const slope = Math.max(trueSlope, MIN_NEWTON_SLOPE);

  ctx.system.stampMatrixEntry(branch, out, 1);
  ctx.system.stampMatrixEntry(branch, pole, -slope);
  ctx.system.stampRhsEntry(branch, value - slope * guess);
  ctx.system.stampMatrixEntry(out, branch, 1);
  ctx.system.stampMatrixEntry(pole, branch, -1);
}

/** Nonlinear (Newton-linearized) branch implementing V(out) = clamp(openLoopGain * (V(in+) - V(in-)), rails)
 * directly - used when rails are set but gbwpHz is not, so no separate internal pole node is needed. */
function stampClippedAmplifier(el: OpAmpElement, branch: number, inPlus: number, inMinus: number, out: number, ctx: StampContext): void {
  const vPlusGuess = inPlus >= 0 ? ctx.solutionGuess[inPlus] : 0;
  const vMinusGuess = inMinus >= 0 ? ctx.solutionGuess[inMinus] : 0;
  const x = limitClampInput(ctx, `${el.id}:x`, el.openLoopGain * (vPlusGuess - vMinusGuess), el);
  const { value, slope: trueSlope } = clampToRails(x, el.railPositive!, el.railNegative!);
  // Deep in a rail the tanh's slope underflows to ~0 and Newton can never pull the output back - a
  // single-supply follower starting from 0V sits there forever. A small floor keeps a way out. The
  // fixed point is unchanged: at convergence out = value whatever slope the linearization used.
  const slope = Math.max(trueSlope, MIN_NEWTON_SLOPE);
  const gp = slope * el.openLoopGain;

  ctx.system.stampMatrixEntry(branch, out, 1);
  ctx.system.stampMatrixEntry(branch, inPlus, -gp);
  ctx.system.stampMatrixEntry(branch, inMinus, gp);
  ctx.system.stampRhsEntry(branch, value - slope * x);
  ctx.system.stampMatrixEntry(out, branch, 1);
}

export function updateOpAmpHistory(el: OpAmpElement, topology: StampContext["topology"], history: Map<string, number>, solution: Float64Array): void {
  if (!hasGbwp(el)) return;
  const pole = nodeOf(topology, poleNodeId(el.id));
  history.set(poleNodeId(el.id), pole >= 0 ? solution[pole] : 0);
}
