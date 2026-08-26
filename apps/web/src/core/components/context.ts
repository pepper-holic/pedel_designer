import type { MnaSystem } from "../solver/mna";
import type { CircuitTopology } from "../solver/topology";

export interface StampContext {
  system: MnaSystem;
  topology: CircuitTopology;
  /** Current Newton iterate of the node voltages (0 for every node on the first iteration). */
  solutionGuess: Float64Array;
  /** Per-element persistent state across timesteps, e.g. previous capacitor voltage or inductor current. */
  history: Map<string, number>;
  /** Timestep size in seconds. 0 means "DC operating point" (capacitors open, inductors shorted). */
  dt: number;
  /** Per-element scratch state that persists only across Newton iterations within a single timestep (e.g. diode voltage limiting). */
  limitState: Map<string, number>;
}
