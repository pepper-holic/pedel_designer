import { buildTopology, nodeOf } from "./topology";
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

type StreamOptions = Omit<TransientOptions, "inputSamples">;

function sameShape(a: ReturnType<typeof buildTopology>, b: ReturnType<typeof buildTopology>): boolean {
  if (a.size !== b.size || a.numNodes !== b.numNodes) return false;
  for (const [k, v] of a.nodeIndex) if (b.nodeIndex.get(k) !== v) return false;
  for (const [k, v] of a.branchIndex) if (b.branchIndex.get(k) !== v) return false;
  return true;
}

/**
 * The transient simulation as a stream: feed it one input sample at a time and it advances the
 * circuit by one output sample, keeping every bit of state (reactive history, last solutions, slew
 * state) between calls. `runTransient` is this run over a whole buffer; the real-time audio worklet
 * runs it 128 samples at a time.
 */
export class TransientStream {
  private netlist: Netlist;
  private topology: ReturnType<typeof buildTopology>;
  private readonly options: StreamOptions;
  private readonly oversample: number;
  private readonly dt: number;
  private readonly warmStart: boolean;
  private readonly integration: IntegrationMethod;
  private history = new Map<string, number>();
  private slewHistory = new Map<string, number>();
  private drivenElements: VoltageSourceElement[] = [];
  private workspace: NewtonWorkspace;
  private tapIndex: Int32Array;
  private readonly tapSum: Float64Array;
  private previousSolution: Float64Array | undefined;
  private olderSolution: Float64Array | undefined;
  private predicted: Float64Array;
  private previousDrive = 0;
  private step = 0;
  nonConvergentSampleCount = 0;
  worstNonConvergentDelta = 0;

  constructor(netlist: Netlist, options: StreamOptions) {
    this.options = options;
    this.oversample = options.oversample ?? 1;
    this.dt = 1 / (options.sampleRate * this.oversample);
    this.warmStart = options.warmStart ?? true;
    this.integration = options.integration ?? "backwardEuler";
    this.netlist = netlist;
    this.topology = buildTopology(netlist);
    this.workspace = new NewtonWorkspace(this.topology.size);
    this.predicted = new Float64Array(this.topology.size);
    this.tapIndex = Int32Array.from(options.tapNodes.map((node) => nodeOf(this.topology, node)));
    this.tapSum = new Float64Array(options.tapNodes.length);
    this.bindDrivenElements();
  }

  private bindDrivenElements() {
    const inputElement = this.netlist.elements.find((e) => e.id === this.options.inputSourceId);
    if (!inputElement || inputElement.type !== "vsource") {
      throw new Error(`Input source not found or not a vsource: ${this.options.inputSourceId}`);
    }
    // The named input plus every source flagged as carrying the signal (see VoltageSourceElement).
    this.drivenElements = this.netlist.elements.filter(
      (e): e is VoltageSourceElement => e.type === "vsource" && (e.id === this.options.inputSourceId || e.isSignalSource === true),
    );
  }

  /**
   * Swaps in a changed circuit mid-stream - a turned knob, a changed part value. When the new
   * netlist has the same nodes and branches (the usual case: values change, wiring does not), the
   * circuit keeps its state and carries on without a click; otherwise it starts from rest.
   */
  replaceNetlist(netlist: Netlist): void {
    const topology = buildTopology(netlist);
    const keep = sameShape(this.topology, topology);
    this.netlist = netlist;
    this.topology = topology;
    this.bindDrivenElements();
    this.tapIndex = Int32Array.from(this.options.tapNodes.map((node) => (topology.nodeIndex.has(node) || node === "0" ? nodeOf(topology, node) : -1)));
    if (keep) return;
    this.workspace = new NewtonWorkspace(topology.size);
    this.predicted = new Float64Array(topology.size);
    this.history.clear();
    this.slewHistory.clear();
    this.previousSolution = undefined;
    this.olderSolution = undefined;
    this.step = 0;
  }

  /** Stamps-in a solved step: slew limiting, then every reactive element's history. */
  private commitStep(solution: Float64Array, stepDt: number, stepIntegration: IntegrationMethod) {
    const { netlist, topology, history } = this;
    applySlewRateLimiting(netlist, topology, solution, this.slewHistory, stepDt);
    for (const element of netlist.elements) {
      if (element.type === "capacitor") updateCapacitorHistory(element, topology, history, solution, stepDt, stepIntegration);
      if (element.type === "inductor") updateInductorHistory(element, topology, history, stepDt, solution, stepIntegration);
      if (element.type === "coupledInductors") updateCoupledInductorsHistory(element, topology, history, stepDt, solution);
      if (element.type === "opamp") updateOpAmpHistory(element, topology, history, solution);
    }
  }

  /**
   * Retries a step that did not converge as shorter sub-steps, ramping the input across them. A
   * smaller step keeps each solve close to where the last one ended, which is what settles a fuzz
   * whose two junctions otherwise make Newton overshoot back and forth (the standard simulator
   * remedy: cut the timestep). History is restored before each finer attempt.
   */
  private subdivide(fromDrive: number, toDrive: number, guess: Float64Array | undefined, stepIntegration: IntegrationMethod): NewtonResult {
    const { netlist, topology, history, slewHistory, workspace, dt } = this;
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
        for (const el of this.drivenElements) el.voltage = d;
        last = solveNewton(netlist, topology, history, dt / parts, { integration: stepIntegration, workspace, ...(this.warmStart && g ? { initialGuess: g } : {}) });
        if (!last.converged) {
          ok = false;
          worstSubstepDelta = Math.max(worstSubstepDelta, last.lastDelta ?? Infinity);
        }
        this.commitStep(last.solution, dt / parts, stepIntegration);
        g = last.solution;
      }
      if (ok) return { solution: last!.solution, converged: true };
    }
    // Report the step as failed if any of its finest sub-steps failed, with the worst of them.
    return { solution: last!.solution, converged: false, lastDelta: worstSubstepDelta };
  }

  /**
   * Advances one output sample. `curr` is this input sample and `next` the following one (used to
   * interpolate the input across oversampled sub-steps; pass `curr` again when it is not known).
   * Writes each tap node's voltage, averaged over the sub-steps, into `out`.
   */
  advance(curr: number, next: number, out: Float64Array): void {
    const { oversample, topology, dt, warmStart, tapIndex, tapSum } = this;
    if (this.step === 0) this.previousDrive = curr;
    for (let sub = 0; sub < oversample; sub++) {
      const drive = curr + ((next - curr) * sub) / oversample;
      for (const el of this.drivenElements) el.voltage = drive;

      // Trapezoidal needs a consistent i(t-dt) for every reactive element, and at step 0 that
      // history is empty - defaulting it to zero silently assumes nothing was happening before the
      // run started, which is wrong the instant the input is not already zero (e.g. a hard step).
      // Real simulators sidestep exactly this with a backward-Euler "startup" step; using it only
      // for step 0 fixes the first sample without touching trapezoidal's accuracy afterwards.
      const stepIntegration: IntegrationMethod = this.step === 0 ? "backwardEuler" : this.integration;
      // Start from where the last two samples say this one is heading (linear extrapolation): on a
      // smooth waveform that lands much closer than the previous sample alone, saving Newton steps.
      const prev = this.previousSolution;
      const older = this.olderSolution;
      if (warmStart && prev && older) for (let k = 0; k < this.predicted.length; k++) this.predicted[k] = 2 * prev[k] - older[k];
      let result: NewtonResult;
      try {
        result = solveNewton(this.netlist, topology, this.history, dt, {
          integration: stepIntegration,
          workspace: this.workspace,
          ...(warmStart ? { initialGuess: prev && older ? this.predicted : prev, limitReference: prev } : {}),
        });
      } catch {
        // A degenerate linearisation (e.g. an exponential overflow) - treat like non-convergence.
        result = { solution: new Float64Array(topology.size), converged: false, lastDelta: Infinity };
      }
      let { solution, converged, lastDelta } = result;
      if (converged) this.commitStep(solution, dt, stepIntegration);
      else ({ solution, converged, lastDelta } = this.subdivide(this.previousDrive, drive, prev, stepIntegration));
      this.previousDrive = drive;
      if (warmStart) {
        this.olderSolution = prev;
        this.previousSolution = solution;
      }
      if (!converged) {
        this.nonConvergentSampleCount++;
        this.worstNonConvergentDelta = Math.max(this.worstNonConvergentDelta, lastDelta ?? Infinity);
      }
      for (let t = 0; t < tapIndex.length; t++) tapSum[t] += tapIndex[t] < 0 ? 0 : solution[tapIndex[t]];
      this.step++;
    }
    for (let t = 0; t < tapIndex.length; t++) {
      out[t] = tapSum[t] / oversample;
      tapSum[t] = 0;
    }
  }
}

/** Runs a time-domain simulation, sample-by-sample, feeding `inputSamples` through a voltage source. */
export function runTransient(netlist: Netlist, options: TransientOptions): TransientResult {
  const stream = new TransientStream(netlist, options);
  const input = options.inputSamples;
  const n = input.length;
  const traces = new Map<NodeId, Float64Array>();
  const columns = options.tapNodes.map((node) => {
    const column = new Float64Array(n);
    traces.set(node, column);
    return column;
  });
  const out = new Float64Array(options.tapNodes.length);
  for (let i = 0; i < n; i++) {
    stream.advance(input[i], i + 1 < n ? input[i + 1] : input[i], out);
    for (let t = 0; t < columns.length; t++) columns[t][i] = out[t];
  }
  return { traces, nonConvergentSampleCount: stream.nonConvergentSampleCount, worstNonConvergentDelta: stream.worstNonConvergentDelta };
}
