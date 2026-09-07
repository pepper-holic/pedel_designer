import { MnaSystem } from "./mna";
import type { CircuitTopology } from "./topology";
import type { Netlist } from "./types";
import { stampElement } from "../components";
import type { StampContext } from "../components/context";

export interface NewtonOptions {
  maxIterations?: number;
  tolerance?: number;
  /**
   * Voltages to start iterating from, instead of all-zero.
   *
   * In a transient run the operating point moves only slightly between adjacent samples, so the
   * previous sample's answer is a far better starting point than zero volts - especially for a
   * clipping stage, where starting from zero means re-crossing the diode knee from scratch every
   * sample and burning iterations to get back where you already were (docs/ROADMAP.md §6 risk 4).
   */
  initialGuess?: Float64Array;
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

  // Length is checked rather than assumed: a caller reusing a guess across a topology change would
  // otherwise silently seed the wrong nodes.
  let guess =
    options.initialGuess && options.initialGuess.length === topology.size
      ? Float64Array.from(options.initialGuess)
      : new Float64Array(topology.size);
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
