import { nodeOf } from "../solver/topology";
import { voltageAt } from "../solver/solution";
import type { JfetElement } from "../solver/types";
import type { StampContext } from "./context";

/** Small parallel conductance so the matrix never goes singular with a floating gate or Vds=0. */
export const JFET_GMIN = 1e-12;

export interface JfetLinearization {
  id0: number;
  gm: number;
}

/**
 * Shichman-Hodges square-law model, saturation region only (Id independent of Vds - fine for the
 * gate-biased buffer/boost stages this component targets, which keep the JFET well into pinch-off).
 * Id = Idss*(1 - Vgs/Vp)^2 for Vp < Vgs < 0, clamped flat to Idss above Vgs=0 and to 0 below Vgs=Vp
 * (real forward gate conduction / full cutoff are both outside the intended operating range).
 */
export function linearizeJfet(el: JfetElement, vgs: number): JfetLinearization {
  const vp = el.pinchOffVoltage; // negative
  if (vgs <= vp) return { id0: 0, gm: 0 };
  if (vgs >= 0) return { id0: el.idss, gm: 0 };

  const ratio = 1 - vgs / vp;
  const id0 = el.idss * ratio * ratio;
  const gm = ((-2 * el.idss) / vp) * ratio;
  return { id0, gm };
}

export function stampJfet(el: JfetElement, ctx: StampContext): void {
  const g = nodeOf(ctx.topology, el.nodes[0]);
  const d = nodeOf(ctx.topology, el.nodes[1]);
  const s = nodeOf(ctx.topology, el.nodes[2]);

  const vgs = voltageAt(ctx.topology, ctx.solutionGuess, el.nodes[0]) - voltageAt(ctx.topology, ctx.solutionGuess, el.nodes[2]);
  const { id0, gm } = linearizeJfet(el, vgs);
  const ieq = id0 - gm * vgs; // Id(vgs) ~= ieq + gm*vgs

  const M = ctx.system;

  // VCCS: Id flows from drain to source, controlled by Vgs = Vg - Vs.
  M.stampMatrixEntry(d, g, gm);
  M.stampMatrixEntry(d, s, -gm);
  M.stampRhsEntry(d, -ieq);
  M.stampMatrixEntry(s, g, -gm);
  M.stampMatrixEntry(s, s, gm);
  M.stampRhsEntry(s, ieq);

  // Small stabilizing conductances: drain-source (output conductance, this model has none otherwise)
  // and gate-source (models the reverse-biased gate junction's leakage, keeps a floating gate solvable).
  M.stampMatrixEntry(d, d, JFET_GMIN);
  M.stampMatrixEntry(d, s, -JFET_GMIN);
  M.stampMatrixEntry(s, d, -JFET_GMIN);
  M.stampMatrixEntry(s, s, JFET_GMIN);

  M.stampMatrixEntry(g, g, JFET_GMIN);
  M.stampMatrixEntry(g, s, -JFET_GMIN);
  M.stampMatrixEntry(s, g, -JFET_GMIN);
  M.stampMatrixEntry(s, s, JFET_GMIN);
}
