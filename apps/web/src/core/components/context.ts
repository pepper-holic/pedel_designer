import type { MnaSystem } from "../solver/mna";
import type { CircuitTopology } from "../solver/topology";

/**
 * How reactive elements are discretised.
 *
 * Backward Euler is first-order and unconditionally stable, which is why it is the default: a
 * user-built circuit can be arbitrarily stiff and it will never ring. Trapezoidal is second-order
 * and tracks the real response far more closely at a given timestep, at the cost of being able to
 * ring on stiff networks - worth choosing where accuracy is the point and the timestep is small.
 */
export type IntegrationMethod = "backwardEuler" | "trapezoidal";

export interface StampContext {
  system: MnaSystem;
  topology: CircuitTopology;
  /** Current Newton iterate of the node voltages (0 for every node on the first iteration). */
  solutionGuess: Float64Array;
  /** Per-element persistent state across timesteps, e.g. previous capacitor voltage or inductor current. */
  history: Map<string, number>;
  /** Timestep size in seconds. 0 means "DC operating point" (capacitors open, inductors shorted). */
  dt: number;
  /** Defaults to backward Euler when absent. */
  integration?: IntegrationMethod;
  /** Per-element scratch state that persists only across Newton iterations within a single timestep (e.g. diode voltage limiting). */
  limitState: Map<string, number>;
  /**
   * The last solved operating point (the previous sample's answer). Junction limiting measures each
   * junction's first step from here instead of from 0V - otherwise every sample's first step would be
   * clamped as if the junction were switching on from cold, throwing away the warm start. It is the
   * *solved* point, not the (extrapolated) starting guess: an extrapolation can overshoot, and
   * limiting is exactly what keeps that overshoot from blowing up the junction exponential.
   */
  limitReference?: Float64Array;
}
