import { nodeOf } from "../solver/topology";
import { voltageAt } from "../solver/solution";
import type { DiodeElement } from "../solver/types";
import type { StampContext } from "./context";
import { criticalVoltage, limitVoltage } from "./junction";

/** Small parallel conductance added to every diode so the matrix never goes singular when reverse-biased. */
const GMIN = 1e-12;

export function stampDiode(el: DiodeElement, ctx: StampContext): void {
  const p = nodeOf(ctx.topology, el.nodes[0]);
  const n = nodeOf(ctx.topology, el.nodes[1]);
  const { saturationCurrent: is, thermalVoltage: vt, emissionCoefficient: nFactor } = el;
  const veff = nFactor * vt;

  const vdRaw = voltageAt(ctx.topology, ctx.solutionGuess, el.nodes[0]) - voltageAt(ctx.topology, ctx.solutionGuess, el.nodes[1]);
  const vold = ctx.limitState.get(el.id) ?? 0;
  const vd = limitVoltage(vdRaw, vold, veff, criticalVoltage(is, veff));
  ctx.limitState.set(el.id, vd);

  const id = is * (Math.exp(vd / veff) - 1);
  const geq = (id + is) / veff + GMIN;
  const ieq = id - geq * vd;

  ctx.system.stampConductance(p, n, geq);
  ctx.system.stampCurrentSource(n, p, ieq);
}
