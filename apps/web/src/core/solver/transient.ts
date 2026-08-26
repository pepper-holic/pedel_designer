import { buildTopology } from "./topology";
import { voltageAt } from "./solution";
import { solveNewton } from "./newton";
import { updateCapacitorHistory, updateInductorHistory } from "../components";
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

  for (let i = 0; i < n; i++) {
    inputElement.voltage = options.inputSamples[i];
    const solution = solveNewton(netlist, topology, history, dt);

    for (const node of options.tapNodes) {
      traces.get(node)![i] = voltageAt(topology, solution, node);
    }

    for (const element of netlist.elements) {
      if (element.type === "capacitor") updateCapacitorHistory(element, topology, history, solution);
      if (element.type === "inductor") updateInductorHistory(element, topology, history, dt, solution);
    }
  }

  return { traces };
}
