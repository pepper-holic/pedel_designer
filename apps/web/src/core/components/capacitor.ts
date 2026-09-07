import { nodeOf } from "../solver/topology";
import { voltageAt } from "../solver/solution";
import type { CapacitorElement } from "../solver/types";
import type { StampContext } from "./context";

/**
 * Norton companion model.
 *
 * Backward Euler: i(t) = Geq*v(t) - Geq*v(t-dt), with Geq = C/dt - a conductance in parallel with a
 * source holding the previous voltage.
 *
 * Trapezoidal: i(t) = Geq*v(t) - [Geq*v(t-dt) + i(t-dt)], with Geq = 2C/dt. The extra term is the
 * previous *current*, which is what makes it second-order - and what makes it need a second history
 * value, kept under a suffixed key.
 */
export function stampCapacitor(el: CapacitorElement, ctx: StampContext): void {
  const p = nodeOf(ctx.topology, el.nodes[0]);
  const n = nodeOf(ctx.topology, el.nodes[1]);
  if (ctx.dt <= 0) return; // DC operating point: capacitor is an open circuit.

  const trapezoidal = ctx.integration === "trapezoidal";
  const geq = (trapezoidal ? 2 : 1) * (el.capacitance / ctx.dt);
  const prevVoltage = ctx.history.get(el.id) ?? 0;
  const prevCurrent = trapezoidal ? (ctx.history.get(`${el.id}#i`) ?? 0) : 0;
  ctx.system.stampConductance(p, n, geq);
  ctx.system.stampCurrentSource(p, n, geq * prevVoltage + prevCurrent);
}

export function updateCapacitorHistory(
  el: CapacitorElement,
  topology: StampContext["topology"],
  history: Map<string, number>,
  solution: Float64Array,
  dt = 0,
  integration: StampContext["integration"] = "backwardEuler",
): void {
  const voltage = voltageAt(topology, solution, el.nodes[0]) - voltageAt(topology, solution, el.nodes[1]);
  // The branch current is recovered and stored on every step, whichever method just ran - not only
  // trapezoidal ones. A trapezoidal step needs i(t-dt) from whatever preceded it, including a
  // backward-Euler "startup" step (see transient.ts); if this were only tracked on trapezoidal
  // steps, the first trapezoidal step after a BE one would see a stale/zero current and reproduce
  // the exact discontinuity artifact the startup step exists to avoid.
  if (dt > 0) {
    const trapezoidal = integration === "trapezoidal";
    const geq = (trapezoidal ? 2 : 1) * (el.capacitance / dt);
    const prevVoltage = history.get(el.id) ?? 0;
    const prevCurrent = trapezoidal ? (history.get(`${el.id}#i`) ?? 0) : 0;
    history.set(`${el.id}#i`, geq * voltage - (geq * prevVoltage + prevCurrent));
  }
  history.set(el.id, voltage);
}
