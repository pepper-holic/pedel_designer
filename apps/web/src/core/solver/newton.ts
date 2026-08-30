import { MnaSystem } from "./mna";
import type { CircuitTopology } from "./topology";
import type { Netlist } from "./types";
import { stampElement } from "../components";
import type { StampContext } from "../components/context";

export interface NewtonOptions {
  maxIterations?: number;
  tolerance?: number;
}

export interface NewtonResult {
  solution: Float64Array<ArrayBuffer>;
  /** False when the iteration hit `maxIterations` without the node voltages settling within
   * `tolerance` - the returned solution is then just the last guess, not a solved operating point.
   * Callers that run this per-sample (transient) should track and surface this rather than trust
   * every sample silently, since a stiff or badly-conditioned user-built circuit (e.g. a tight
   * feedback loop through two diodes) can fail to converge without producing NaN or throwing. */
  converged: boolean;
}

/**
 * Solves one timestep (or the DC operating point, when dt = 0) by repeatedly
 * stamping the network at the current voltage guess and re-solving until the
 * node voltages stop moving. Linear-only netlists converge in a single pass.
 */
export function solveNewton(
  netlist: Netlist,
  topology: CircuitTopology,
  history: Map<string, number>,
  dt: number,
  options: NewtonOptions = {},
): NewtonResult {
  const maxIterations = options.maxIterations ?? 50;
  const tolerance = options.tolerance ?? 1e-9;

  let guess = new Float64Array(topology.size);
  const limitState = new Map<string, number>();
  for (let iter = 0; iter < maxIterations; iter++) {
    const system = new MnaSystem(topology.size);
    const ctx: StampContext = { system, topology, solutionGuess: guess, history, dt, limitState };
    for (const element of netlist.elements) {
      stampElement(element, ctx);
    }
    const solution = system.solve();

    let maxDelta = 0;
    for (let i = 0; i < topology.numNodes; i++) {
      maxDelta = Math.max(maxDelta, Math.abs(solution[i] - guess[i]));
    }
    guess = solution;
    if (maxDelta < tolerance) return { solution, converged: true };
  }
  return { solution: guess, converged: false };
}
