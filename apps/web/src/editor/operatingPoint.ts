import { buildTopology } from "../core/solver/topology";
import { solveNewton } from "../core/solver/newton";
import { voltageAt } from "../core/solver/solution";
import type { NodeId } from "../core/solver/types";
import type { GraphNetlist } from "./netlistFromGraph";

export interface OperatingPoint {
  /** DC voltage of every user-visible net, with the audio input held at 0V. */
  voltages: Map<NodeId, number>;
  /** False when the DC Newton solve hit its iteration cap - the numbers are then a best guess. */
  converged: boolean;
}

/**
 * The circuit's DC bias point: every net's voltage with no signal applied.
 *
 * This is the first thing anyone checks on a transistor stage - is the collector sitting near half
 * supply, is the JFET's source where the design expects - and it answers "why is my fuzz silent"
 * faster than any waveform. The input source is forced to 0V on a copy of the netlist, so a canvas
 * source left at some non-zero test voltage does not shift the bias reading.
 */
export function computeOperatingPoint(graph: GraphNetlist): OperatingPoint | null {
  if (graph.netlist.elements.length === 0) return null;
  const netlist = {
    elements: graph.netlist.elements.map((el) => (el.id === graph.inputSourceId && el.type === "vsource" ? { ...el, voltage: 0 } : el)),
  };
  try {
    const topology = buildTopology(netlist);
    const { solution, converged } = solveNewton(netlist, topology, new Map(), 0);
    const voltages = new Map<NodeId, number>();
    for (const net of graph.netNames) voltages.set(net, net === "0" ? 0 : voltageAt(topology, solution, net));
    return { voltages, converged };
  } catch {
    // A singular matrix (floating node, voltage-source loop) has no operating point to show - DRC
    // already explains why, so this just stays quiet rather than throwing into the render.
    return null;
  }
}

/** "4.52V", "-12mV", "0V" - compact enough to sit next to a terminal on the canvas. */
export function formatVoltage(volts: number): string {
  const abs = Math.abs(volts);
  if (abs < 0.0005) return "0V";
  if (abs < 1) return `${(volts * 1000).toFixed(0)}mV`;
  return `${volts.toFixed(abs < 10 ? 2 : 1)}V`;
}
