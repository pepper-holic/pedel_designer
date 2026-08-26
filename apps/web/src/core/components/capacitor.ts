import { nodeOf } from "../solver/topology";
import { voltageAt } from "../solver/solution";
import type { CapacitorElement } from "../solver/types";
import type { StampContext } from "./context";

/**
 * Backward-Euler Norton companion model: i(t) = Geq*v(t) - Geq*v(t-dt), i.e. a
 * conductance Geq = C/dt in parallel with a current source sourced from the
 * previous timestep's voltage across the capacitor.
 */
export function stampCapacitor(el: CapacitorElement, ctx: StampContext): void {
  const p = nodeOf(ctx.topology, el.nodes[0]);
  const n = nodeOf(ctx.topology, el.nodes[1]);
  if (ctx.dt <= 0) return; // DC operating point: capacitor is an open circuit.

  const geq = el.capacitance / ctx.dt;
  const prevVoltage = ctx.history.get(el.id) ?? 0;
  ctx.system.stampConductance(p, n, geq);
  ctx.system.stampCurrentSource(p, n, geq * prevVoltage);
}

export function updateCapacitorHistory(
  el: CapacitorElement,
  topology: StampContext["topology"],
  history: Map<string, number>,
  solution: Float64Array,
): void {
  const voltage = voltageAt(topology, solution, el.nodes[0]) - voltageAt(topology, solution, el.nodes[1]);
  history.set(el.id, voltage);
}
