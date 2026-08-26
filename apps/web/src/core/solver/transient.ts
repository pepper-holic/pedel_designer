import { buildTopology, nodeOf } from "./topology";
import { voltageAt } from "./solution";
import { solveNewton } from "./newton";
import { updateCapacitorHistory, updateInductorHistory, updateOpAmpHistory } from "../components";
import type { Netlist, NodeId } from "./types";

export interface TransientOptions {
  /** Element id of the input voltage source driven sample-by-sample by `inputSamples`. */
  inputSourceId: string;
  inputSamples: ArrayLike<number>;
  sampleRate: number;
  /** Nodes to record a voltage trace for at every sample. */
  tapNodes: NodeId[];
}

export interface TransientResult {
  traces: Map<NodeId, Float64Array>;
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

/** Runs a time-domain simulation, sample-by-sample, feeding `inputSamples` through a voltage source. */
export function runTransient(netlist: Netlist, options: TransientOptions): TransientResult {
  const topology = buildTopology(netlist);
  const dt = 1 / options.sampleRate;
  const history = new Map<string, number>();

  const inputElement = netlist.elements.find((e) => e.id === options.inputSourceId);
  if (!inputElement || inputElement.type !== "vsource") {
    throw new Error(`Input source not found or not a vsource: ${options.inputSourceId}`);
  }

  const n = options.inputSamples.length;
  const traces = new Map<NodeId, Float64Array>();
  for (const node of options.tapNodes) traces.set(node, new Float64Array(n));
  const slewHistory = new Map<string, number>();

  for (let i = 0; i < n; i++) {
    inputElement.voltage = options.inputSamples[i];
    const solution = solveNewton(netlist, topology, history, dt);
    applySlewRateLimiting(netlist, topology, solution, slewHistory, dt);

    for (const node of options.tapNodes) {
      traces.get(node)![i] = voltageAt(topology, solution, node);
    }

    for (const element of netlist.elements) {
      if (element.type === "capacitor") updateCapacitorHistory(element, topology, history, solution);
      if (element.type === "inductor") updateInductorHistory(element, topology, history, dt, solution);
      if (element.type === "opamp") updateOpAmpHistory(element, topology, history, solution);
    }
  }

  return { traces };
}
