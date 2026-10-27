import { nodeOf } from "../solver/topology";
import { voltageAt } from "../solver/solution";
import type { BjtElement } from "../solver/types";
import type { StampContext } from "./context";
import { criticalVoltage, limitVoltage } from "./junction";

/** Small parallel conductance on each junction so the matrix never goes singular deep in cutoff. */
const GMIN = 1e-12;

export interface BjtLinearization {
  gpi: number;
  gmu: number;
  gm: number;
  go: number;
  ib0: number;
  ic0: number;
}

/**
 * Simplified (Early-effect-free) SPICE Level-1 Ebers-Moll transport model,
 * linearized around a given (vbe, vbc) junction bias into a 2-junction
 * admittance description across (base, collector, emitter). Shared between
 * the transient companion-model stamp and the AC small-signal analysis.
 */
export function linearizeBjt(el: BjtElement, vbe: number, vbc: number): BjtLinearization {
  const { saturationCurrent: is, thermalVoltage: vt, forwardBeta: bf, reverseBeta: br } = el;

  const ifwd = is * (Math.exp(vbe / vt) - 1);
  const irev = is * (Math.exp(vbc / vt) - 1);

  const ib0 = ifwd / bf + irev / br;
  const ic0 = ifwd - irev - irev / br;

  const gpi = (ifwd + is) / (bf * vt) + GMIN;
  const gmu = (irev + is) / (br * vt) + GMIN;
  const gm = (ifwd + is) / vt;
  const go = (-(irev + is) * (1 + 1 / br)) / vt;

  return { gpi, gmu, gm, go, ib0, ic0 };
}

export function stampBjt(el: BjtElement, ctx: StampContext): void {
  const b = nodeOf(ctx.topology, el.nodes[0]);
  const c = nodeOf(ctx.topology, el.nodes[1]);
  const e = nodeOf(ctx.topology, el.nodes[2]);
  const sign = el.polarity === "pnp" ? -1 : 1;

  const vbeRaw = sign * (voltageAt(ctx.topology, ctx.solutionGuess, el.nodes[0]) - voltageAt(ctx.topology, ctx.solutionGuess, el.nodes[2]));
  const vbcRaw = sign * (voltageAt(ctx.topology, ctx.solutionGuess, el.nodes[0]) - voltageAt(ctx.topology, ctx.solutionGuess, el.nodes[1]));

  const vcrit = criticalVoltage(el.saturationCurrent, el.thermalVoltage);
  const ref = ctx.limitReference;
  const vbeOld = ctx.limitState.get(`${el.id}:be`) ?? (ref ? sign * (voltageAt(ctx.topology, ref, el.nodes[0]) - voltageAt(ctx.topology, ref, el.nodes[2])) : 0);
  const vbcOld = ctx.limitState.get(`${el.id}:bc`) ?? (ref ? sign * (voltageAt(ctx.topology, ref, el.nodes[0]) - voltageAt(ctx.topology, ref, el.nodes[1])) : 0);
  const vbe = limitVoltage(vbeRaw, vbeOld, el.thermalVoltage, vcrit);
  const vbc = limitVoltage(vbcRaw, vbcOld, el.thermalVoltage, vcrit);
  ctx.limitState.set(`${el.id}:be`, vbe);
  ctx.limitState.set(`${el.id}:bc`, vbc);

  const { gpi, gmu, gm, go, ib0, ic0 } = linearizeBjt(el, vbe, vbc);

  // Constant (bias) terms flip sign for PNP since ib0/ic0 were computed in the sign-flipped junction frame.
  const ibeq = sign * (ib0 - gpi * vbe - gmu * vbc);
  const iceq = sign * (ic0 - gm * vbe - go * vbc);

  const M = ctx.system;
  M.stampMatrixEntry(b, b, gpi + gmu);
  M.stampMatrixEntry(b, e, -gpi);
  M.stampMatrixEntry(b, c, -gmu);
  M.stampRhsEntry(b, -ibeq);

  M.stampMatrixEntry(c, b, gm + go);
  M.stampMatrixEntry(c, e, -gm);
  M.stampMatrixEntry(c, c, -go);
  M.stampRhsEntry(c, -iceq);

  M.stampMatrixEntry(e, b, -(gpi + gm + gmu + go));
  M.stampMatrixEntry(e, e, gpi + gm);
  M.stampMatrixEntry(e, c, gmu + go);
  M.stampRhsEntry(e, ibeq + iceq);
}
