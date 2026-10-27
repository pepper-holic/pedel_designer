import { MnaSystem } from "./mna";
import type { CircuitTopology } from "./topology";
import type { Netlist } from "./types";
import { stampElement } from "../components";
import type { IntegrationMethod, StampContext } from "../components/context";

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
  /** Passed through to the reactive companion models - see StampContext. */
  integration?: IntegrationMethod;
  /** The last solved operating point, for junction limiting (see StampContext.limitReference).
   * Defaults to `initialGuess`. */
  limitReference?: Float64Array;
  /** Buffers reused across calls (see NewtonWorkspace). Omit it and fresh ones are made. */
  workspace?: NewtonWorkspace;
}

/** Whether an element's stamp reads the voltage guess. Everything else (resistors, capacitor and
 * inductor companions, sources, op-amps without rail clipping) stamps the same values on every
 * Newton iteration of a timestep - only their history changes, and that changes between steps. */
function readsGuess(e: Netlist["elements"][number]): boolean {
  return e.type === "diode" || e.type === "bjt" || e.type === "jfet" || (e.type === "opamp" && (e.railPositive !== undefined || e.railNegative !== undefined));
}

interface Partition {
  fixed: Netlist["elements"];
  varying: Netlist["elements"];
}

/** Netlists are reused for every sample of a run, so the split is computed once per netlist. */
const partitions = new WeakMap<Netlist, Partition>();
function partitionOf(netlist: Netlist): Partition {
  let p = partitions.get(netlist);
  if (!p) {
    p = { fixed: netlist.elements.filter((e) => !readsGuess(e)), varying: netlist.elements.filter(readsGuess) };
    partitions.set(netlist, p);
  }
  return p;
}

/**
 * Reusable buffers for repeated solves of one topology (a transient run makes one for the whole
 * run): the matrix stamped each iteration, and a base holding the stamps that do not change within
 * a timestep.
 */
/** Iterations of plain Newton before steps are damped, and the fraction of each step then taken. */
const DAMPING_AFTER = 20;
const DAMPING = 0.5;

export class NewtonWorkspace {
  readonly size: number;
  readonly system: MnaSystem;
  readonly base: MnaSystem;
  /** The current Newton iterate, updated in place. */
  readonly guess: Float64Array;
  readonly limitState = new Map<string, number>();
  constructor(size: number) {
    this.size = size;
    this.system = new MnaSystem(size);
    this.base = new MnaSystem(size);
    this.guess = new Float64Array(size);
  }
}

/**
 * Newton stops when no node voltage moves by more than this. 1µV is -120dB below a 1V signal - far
 * under anything audible or plottable - and stopping there instead of at 1nV saves roughly one
 * iteration in four on a clipping circuit (Newton's error after a step of d is ~d², so the extra
 * iteration was only ever confirming digits nobody can hear).
 */
const DEFAULT_TOLERANCE = 1e-6;

export interface NewtonResult {
  solution: Float64Array<ArrayBuffer>;
  /** False when the iteration hit `maxIterations` without the node voltages settling within
   * `tolerance` - the returned solution is then just the last guess, not a solved operating point.
   * Callers that run this per-sample (transient) should track and surface this rather than trust
   * every sample silently, since a stiff or badly-conditioned user-built circuit (e.g. a tight
   * feedback loop through two diodes) can fail to converge without producing NaN or throwing. */
  converged: boolean;
  /** Largest node-voltage change of the last iteration - how far from settled a non-converged
   * result was (tiny means "converged to rounding noise", large means genuinely oscillating). */
  lastDelta?: number;
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
  const tolerance = options.tolerance ?? DEFAULT_TOLERANCE;

  const ws = options.workspace && options.workspace.size === topology.size ? options.workspace : new NewtonWorkspace(topology.size);
  const { fixed, varying } = partitionOf(netlist);
  const { system, base, guess } = ws;
  // Length is checked rather than assumed: a caller reusing a guess across a topology change would
  // otherwise silently seed the wrong nodes.
  const warmStarted = options.initialGuess !== undefined && options.initialGuess.length === topology.size;
  if (warmStarted) guess.set(options.initialGuess!);
  else guess.fill(0);
  const limitState = ws.limitState;
  limitState.clear();
  const limitReference = options.limitReference?.length === topology.size ? options.limitReference : warmStarted ? options.initialGuess : undefined;

  // Stamps that cannot change within this timestep, done once rather than once per iteration.
  base.reset();
  const ctx: StampContext = { system: base, topology, solutionGuess: guess, history, dt, limitState, integration: options.integration, limitReference };
  for (const element of fixed) stampElement(element, ctx);
  ctx.system = system;

  let lastDelta = Infinity;
  for (let iter = 0; iter < maxIterations; iter++) {
    system.A.set(base.A);
    system.z.set(base.z);
    for (const element of varying) stampElement(element, ctx);
    const x = system.solveInPlace();
    // A circuit with nothing guess-dependent is linear: the first solve is the answer.
    if (varying.length === 0) return { solution: Float64Array.from(x), converged: true };

    let maxDelta = 0;
    for (let i = 0; i < topology.numNodes; i++) {
      const d = Math.abs(x[i] - guess[i]);
      if (d > maxDelta) maxDelta = d;
    }
    lastDelta = maxDelta;
    // The caller keeps the returned solution (warm start, history updates) while the workspace is
    // reused, so only the final answer is copied out - one allocation per solve, not per iteration.
    if (maxDelta < tolerance) return { solution: Float64Array.from(x), converged: true };
    // Still bouncing after many iterations: a feedback loop through two junctions can make plain
    // Newton overshoot back and forth forever. Taking only part of each step from here on breaks the
    // cycle. Iterations that converge normally never get here.
    if (iter >= DAMPING_AFTER) for (let i = 0; i < x.length; i++) guess[i] += DAMPING * (x[i] - guess[i]);
    else guess.set(x);
  }
  return { solution: Float64Array.from(guess), converged: false, lastDelta };
}
