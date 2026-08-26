import { MnaSystem } from "./mna";
import type { CircuitTopology } from "./topology";
import type { Netlist } from "./types";
import { stampElement } from "../components";
import type { StampContext } from "../components/context";

export interface NewtonOptions {
  maxIterations?: number;
  tolerance?: number;
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
): Float64Array<ArrayBuffer> {
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
    if (maxDelta < tolerance) return solution;
  }
  return guess;
}
