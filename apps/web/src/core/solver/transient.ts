import { buildTopology, nodeOf } from "./topology";
import { voltageAt } from "./solution";
import { solveNewton, NewtonWorkspace, type NewtonResult } from "./newton";
import { updateCapacitorHistory, updateCoupledInductorsHistory, updateInductorHistory, updateOpAmpHistory } from "../components";
import type { Netlist, NodeId, VoltageSourceElement } from "./types";
import type { IntegrationMethod } from "../components/context";

export interface TransientOptions {
  /** Element id of the input voltage source driven sample-by-sample by `inputSamples`. */
  inputSourceId: string;
  inputSamples: ArrayLike<number>;
  sampleRate: number;
  /** Nodes to record a voltage trace for at every sample. */
  tapNodes: NodeId[];
  /**
   * Internal Newton solves per output sample (default 1 = no oversampling). A sharp clipping knee
   * (e.g. germanium diodes, veff ~0.031V) can finish its transition within a single 44.1kHz sample
   * period, aliasing the knee and skewing THD measurements (docs/ROADMAP.md §6 risk 2). Values >1
   * shrink dt to resolve that transition, linearly interpolating the input between samples and
   * box-car averaging the sub-samples back down to the output rate.
   */
  oversample?: number;
  /**
   * Seed each sample's Newton solve with the previous sample's answer (default true). Only affects
   * how many iterations the solve takes, never the answer it lands on - the flag exists so tests
   * can show that.
   */
  warmStart?: boolean;
  /**
   * Discretisation for capacitors and inductors. Defaults to backward Euler, which never rings on a
   * stiff user-built circuit; trapezoidal is second-order and much closer to the real response at a
   * given timestep (docs/ROADMAP.md §6 risk 3).
   */
  integration?: IntegrationMethod;
}

export interface TransientResult {
  traces: Map<NodeId, Float64Array>;
  /** Count of samples where the per-sample Newton solve hit the iteration cap without converging -
   * those samples are still present in `traces` (the solver falls back to its last guess rather than
   * throwing or producing NaN) but are not a solved operating point, so their accuracy is suspect.
   * Non-zero here means the circuit is numerically stiff for this waveform - worth a UI warning. */
  nonConvergentSampleCount: number;
  /** Largest last-iteration voltage change among the non-converged samples (0 when there are
   * none): a few microvolts means "settled to rounding noise", tenths of a volt means oscillating. */
  worstNonConvergentDelta: number;
}

/**
 * Software slew-rate limiting: clamps each slew-limited op-amp's output node to at most
 * `slewRateVPerUs` volts/microsecond of change from the previous accepted sample. This is a
 * post-hoc approximation (not a Newton-loop nonlinear stamp) - simpler than modeling the physical
 * current-limited gain stage, and accurate enough for audible slew-induced waveform distortion.
 */
function applySlewRateLimiting(
  netlist: Netlist,
  topology: ReturnType<typeof buildTopology>,
  solution: Float64Array,
  slewHistory: Map<string, number>,
  dt: number,
): void {
  for (const element of netlist.elements) {
    if (element.type !== "opamp" || !element.slewRateVPerUs || element.slewRateVPerUs <= 0) continue;
    const outIndex = nodeOf(topology, element.nodes[2]);
    if (outIndex < 0) continue;

    const prev = slewHistory.get(element.id) ?? 0;
    const maxStep = element.slewRateVPerUs * 1e6 * dt;
    const clamped = Math.max(prev - maxStep, Math.min(prev + maxStep, solution[outIndex]));
    solution[outIndex] = clamped;
    slewHistory.set(element.id, clamped);
  }
}

/** Sub-step counts tried, in order, for a step whose Newton solve does not converge. */
const SUBSTEPS = [4, 16, 64];

/** Runs a time-domain simulation, sample-by-sample, feeding `inputSamples` through a voltage source. */
export function runTransient(netlist: Netlist, options: TransientOptions): TransientResult {
  const oversample = options.oversample ?? 1;
  const topology = buildTopology(netlist);
  const dt = 1 / (options.sampleRate * oversample);
  const history = new Map<string, number>();

  const inputElement = netlist.elements.find((e) => e.id === options.inputSourceId);
  if (!inputElement || inputElement.type !== "vsource") {
    throw new Error(`Input source not found or not a vsource: ${options.inputSourceId}`);
  }
  // The named input plus every source flagged as carrying the signal (see VoltageSourceElement).
  const drivenElements = netlist.elements.filter(
    (e): e is VoltageSourceElement => e.type === "vsource" && (e.id === options.inputSourceId || e.isSignalSource === true),
  );

  const n = options.inputSamples.length;
  const traces = new Map<NodeId, Float64Array>();
  const accum = new Map<NodeId, number>();
  for (const node of options.tapNodes) {
    traces.set(node, new Float64Array(n));
    accum.set(node, 0);
  }
  const slewHistory = new Map<string, number>();
  let nonConvergentSampleCount = 0;
  let worstNonConvergentDelta = 0;
  const warmStart = options.warmStart ?? true;
  const integration: IntegrationMethod = options.integration ?? "backwardEuler";
  let previousSolution: Float64Array | undefined;
  // One matrix for the whole run, cleared and restamped each Newton iteration.
  const workspace = new NewtonWorkspace(topology.size);

  /** Stamps-in a solved step: slew limiting, then every reactive element's history. */
  const commitStep = (solution: Float64Array, stepDt: number, stepIntegration: IntegrationMethod) => {
    applySlewRateLimiting(netlist, topology, solution, slewHistory, stepDt);
    for (const element of netlist.elements) {
      if (element.type === "capacitor") updateCapacitorHistory(element, topology, history, solution, stepDt, stepIntegration);
      if (element.type === "inductor") updateInductorHistory(element, topology, history, stepDt, solution, stepIntegration);
      if (element.type === "coupledInductors") updateCoupledInductorsHistory(element, topology, history, stepDt, solution);
      if (element.type === "opamp") updateOpAmpHistory(element, topology, history, solution);
    }
  };

  /**
   * Retries a step that did not converge as `parts` shorter sub-steps, ramping the input across
   * them. A smaller step keeps each solve close to where the last one ended, which is what settles
   * a fuzz whose two junctions otherwise make Newton overshoot back and forth (the standard
   * simulator remedy: cut the timestep). History is restored first if a finer split is needed.
   */
  const subdivide = (fromDrive: number, toDrive: number, guess: Float64Array | undefined, stepIntegration: IntegrationMethod): NewtonResult => {
    let worstSubstepDelta = 0;
    const savedHistory = new Map(history);
    const savedSlew = new Map(slewHistory);
    let last: NewtonResult | null = null;
    for (const parts of SUBSTEPS) {
      history.clear();
      for (const [k, v] of savedHistory) history.set(k, v);
      slewHistory.clear();
      for (const [k, v] of savedSlew) slewHistory.set(k, v);
      let ok = true;
      worstSubstepDelta = 0;
      let g = guess;
      for (let s = 1; s <= parts; s++) {
        const d = fromDrive + ((toDrive - fromDrive) * s) / parts;
        for (const el of drivenElements) el.voltage = d;
        last = solveNewton(netlist, topology, history, dt / parts, { integration: stepIntegration, workspace, ...(warmStart && g ? { initialGuess: g } : {}) });
        if (!last.converged) {
          ok = false;
          worstSubstepDelta = Math.max(worstSubstepDelta, last.lastDelta ?? Infinity);
        }
        commitStep(last.solution, dt / parts, stepIntegration);
        g = last.solution;
      }
      if (ok) return { solution: last!.solution, converged: true };
    }
    // Report the step as failed if any of its finest sub-steps failed, with the worst of them.
    return { solution: last!.solution, converged: false, lastDelta: worstSubstepDelta };
  };

  let olderSolution: Float64Array | undefined;
  const predicted = new Float64Array(topology.size);
  let previousDrive = options.inputSamples.length > 0 ? options.inputSamples[0] : 0;
  const totalSteps = n * oversample;
  for (let step = 0; step < totalSteps; step++) {
    const i = Math.floor(step / oversample);
    const frac = (step % oversample) / oversample;
    const curr = options.inputSamples[i];
    const next = i + 1 < n ? options.inputSamples[i + 1] : curr;
    const drive = curr + (next - curr) * frac;
    for (const el of drivenElements) el.voltage = drive;

    // Trapezoidal needs a consistent i(t-dt) for every reactive element, and at step 0 that history
    // is empty - defaulting it to zero silently assumes nothing was happening before the run
    // started, which is wrong the instant the input is not already zero (e.g. a hard step). That
    // mismatch shows up as a single badly-off first sample rather than the improved accuracy
    // trapezoidal is there for. Real simulators sidestep exactly this with a backward-Euler
    // "startup" step; using it here only for step 0 fixes the first sample without touching the
    // steady accuracy gain over the rest of the run.
    const stepIntegration: IntegrationMethod = step === 0 ? "backwardEuler" : integration;
    // Start from where the last two samples say this one is heading (linear extrapolation): on a
    // smooth waveform that lands much closer than the previous sample alone, saving Newton steps.
    if (warmStart && previousSolution && olderSolution) {
      for (let k = 0; k < predicted.length; k++) predicted[k] = 2 * previousSolution[k] - olderSolution[k];
    }
    let result: NewtonResult;
    try {
      result = solveNewton(netlist, topology, history, dt, {
        integration: stepIntegration,
        workspace,
        ...(warmStart ? { initialGuess: previousSolution && olderSolution ? predicted : previousSolution, limitReference: previousSolution } : {}),
      });
    } catch {
      // A degenerate linearisation (e.g. an exponential overflow) - treat like non-convergence.
      result = { solution: new Float64Array(topology.size), converged: false, lastDelta: Infinity };
    }
    let { solution, converged, lastDelta } = result;
    if (converged) commitStep(solution, dt, stepIntegration);
    else ({ solution, converged, lastDelta } = subdivide(previousDrive, drive, previousSolution, stepIntegration));
    previousDrive = drive;
    if (warmStart) {
      olderSolution = previousSolution;
      previousSolution = solution;
    }
    if (!converged) {
      nonConvergentSampleCount++;
      worstNonConvergentDelta = Math.max(worstNonConvergentDelta, lastDelta ?? Infinity);
    }

    for (const node of options.tapNodes) {
      accum.set(node, accum.get(node)! + voltageAt(topology, solution, node));
    }

    if ((step + 1) % oversample === 0) {
      for (const node of options.tapNodes) {
        traces.get(node)![i] = accum.get(node)! / oversample;
        accum.set(node, 0);
      }
    }
  }

  return { traces, nonConvergentSampleCount, worstNonConvergentDelta };
}
