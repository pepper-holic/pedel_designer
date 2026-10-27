import { stateKey } from "./keys";
import { nodeOf, type CircuitTopology } from "../solver/topology";
import { voltageAt } from "../solver/solution";
import type { CoupledInductorsElement } from "../solver/types";
import type { StampContext } from "./context";

/**
 * Two magnetically coupled windings, stamped as one two-port.
 *
 * A plain inductor gets a scalar Norton companion (g = dt/L). Coupling cannot be expressed that way:
 * the flux equations are
 *
 *   [v1; v2] = [L1 M; M L2] . d/dt [i1; i2],   M = k * sqrt(L1 * L2)
 *
 * so backward Euler gives [i1; i2] = dt * Linv . [v1; v2] + [i1_prev; i2_prev], with
 * Linv = 1/(L1*L2 - M^2) * [L2 -M; -M L1]. The off-diagonal terms are transconductances between the
 * two ports, which is why the pair has to be one element rather than two inductors plus a link -
 * there is no way to write those cross terms into a two-terminal stamp.
 */

/** Coupling is clamped just below 1: at k = 1 the determinant L1*L2 - M^2 is zero and the inverse
 * does not exist. Perfect coupling is a mathematical idealisation, not a transformer you can buy. */
const MAX_COUPLING = 0.9999;

function mutualTerms(el: CoupledInductorsElement): { g11: number; g22: number; g12: number } | null {
  const k = Math.min(Math.abs(el.coupling), MAX_COUPLING) * Math.sign(el.coupling || 1);
  const m = k * Math.sqrt(el.inductanceA * el.inductanceB);
  const determinant = el.inductanceA * el.inductanceB - m * m;
  if (!(determinant > 0)) return null;
  return { g11: el.inductanceB / determinant, g22: el.inductanceA / determinant, g12: -m / determinant };
}

function ports(el: CoupledInductorsElement, topology: CircuitTopology) {
  return {
    p1: nodeOf(topology, el.nodes[0]),
    n1: nodeOf(topology, el.nodes[1]),
    p2: nodeOf(topology, el.nodes[2]),
    n2: nodeOf(topology, el.nodes[3]),
  };
}

/** Adds `value` to every entry of the 2x2 block linking port (rowP,rowN) to port (colP,colN). */
function stampPortBlock(
  ctx: StampContext,
  rowP: number,
  rowN: number,
  colP: number,
  colN: number,
  value: number,
): void {
  ctx.system.stampMatrixEntry(rowP, colP, value);
  ctx.system.stampMatrixEntry(rowP, colN, -value);
  ctx.system.stampMatrixEntry(rowN, colP, -value);
  ctx.system.stampMatrixEntry(rowN, colN, value);
}

export function stampCoupledInductors(el: CoupledInductorsElement, ctx: StampContext): void {
  const { p1, n1, p2, n2 } = ports(el, ctx.topology);
  const terms = mutualTerms(el);
  if (!terms) return;

  if (ctx.dt <= 0) {
    // DC: both windings are shorts, and a short has no mutual behaviour to speak of.
    ctx.system.stampConductance(p1, n1, 1e6);
    ctx.system.stampConductance(p2, n2, 1e6);
    return;
  }

  stampPortBlock(ctx, p1, n1, p1, n1, ctx.dt * terms.g11);
  stampPortBlock(ctx, p2, n2, p2, n2, ctx.dt * terms.g22);
  stampPortBlock(ctx, p1, n1, p2, n2, ctx.dt * terms.g12);
  stampPortBlock(ctx, p2, n2, p1, n1, ctx.dt * terms.g12);

  // Two history values share the ordinary Map<string, number> by suffixing the key, rather than
  // widening StampContext's history type for this one element.
  ctx.system.stampCurrentSource(n1, p1, ctx.history.get(stateKey(el.id, "#1")) ?? 0);
  ctx.system.stampCurrentSource(n2, p2, ctx.history.get(stateKey(el.id, "#2")) ?? 0);
}

export function updateCoupledInductorsHistory(
  el: CoupledInductorsElement,
  topology: CircuitTopology,
  history: Map<string, number>,
  dt: number,
  solution: Float64Array,
): void {
  if (dt <= 0) return;
  const terms = mutualTerms(el);
  if (!terms) return;
  const v1 = voltageAt(topology, solution, el.nodes[0]) - voltageAt(topology, solution, el.nodes[1]);
  const v2 = voltageAt(topology, solution, el.nodes[2]) - voltageAt(topology, solution, el.nodes[3]);
  history.set(stateKey(el.id, "#1"), dt * (terms.g11 * v1 + terms.g12 * v2) + (history.get(stateKey(el.id, "#1")) ?? 0));
  history.set(stateKey(el.id, "#2"), dt * (terms.g12 * v1 + terms.g22 * v2) + (history.get(stateKey(el.id, "#2")) ?? 0));
}

/** AC susceptance terms: Y = Linv / (j*omega), so each entry is a negative susceptance of
 * `factor / omega`. Returned rather than stamped so ac.ts can use its own complex accumulators. */
export function coupledInductorsAcTerms(el: CoupledInductorsElement): { g11: number; g22: number; g12: number } | null {
  return mutualTerms(el);
}
