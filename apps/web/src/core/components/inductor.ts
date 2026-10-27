import { stateKey } from "./keys";
import { nodeOf, type CircuitTopology } from "../solver/topology";
import { voltageAt } from "../solver/solution";
import type { InductorElement } from "../solver/types";
import type { StampContext } from "./context";

/**
 * Backward-Euler Norton companion model: i(t) = Geq*v(t) + i(t-dt), i.e. a
 * conductance Geq = dt/L in parallel with a current source holding the
 * previous timestep's branch current.
 */
export function stampInductor(el: InductorElement, ctx: StampContext): void {
  const p = nodeOf(ctx.topology, el.nodes[0]);
  const n = nodeOf(ctx.topology, el.nodes[1]);
  if (ctx.dt <= 0) {
    // DC operating point: an inductor is a short circuit; approximate with a large conductance.
    ctx.system.stampConductance(p, n, 1e6);
    return;
  }

  // Trapezoidal halves the conductance and carries the previous voltage as well as the previous
  // current - the dual of the capacitor case above it.
  const trapezoidal = ctx.integration === "trapezoidal";
  const geq = trapezoidal ? ctx.dt / (2 * el.inductance) : ctx.dt / el.inductance;
  const prevCurrent = ctx.history.get(el.id) ?? 0;
  const prevVoltage = trapezoidal ? (ctx.history.get(stateKey(el.id, "#v")) ?? 0) : 0;
  ctx.system.stampConductance(p, n, geq);
  ctx.system.stampCurrentSource(n, p, prevCurrent + geq * prevVoltage);
}

export function updateInductorHistory(
  el: InductorElement,
  topology: CircuitTopology,
  history: Map<string, number>,
  dt: number,
  solution: Float64Array,
  integration: "backwardEuler" | "trapezoidal" = "backwardEuler",
): void {
  if (dt <= 0) return;
  const voltage = voltageAt(topology, solution, el.nodes[0]) - voltageAt(topology, solution, el.nodes[1]);
  const trapezoidal = integration === "trapezoidal";
  const geq = trapezoidal ? dt / (2 * el.inductance) : dt / el.inductance;
  const prevCurrent = history.get(el.id) ?? 0;
  const prevVoltage = trapezoidal ? (history.get(stateKey(el.id, "#v")) ?? 0) : 0;
  history.set(el.id, geq * voltage + prevCurrent + (trapezoidal ? geq * prevVoltage : 0));
  // Tracked on every step regardless of method, for the same reason the capacitor's `#i` is - see
  // the comment there.
  history.set(stateKey(el.id, "#v"), voltage);
}
