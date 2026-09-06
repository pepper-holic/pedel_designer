import { buildTopology, branchOf } from "../core/solver/topology";
import { solveNewton } from "../core/solver/newton";
import type { Netlist, VoltageSourceElement } from "../core/solver/types";

export interface PowerSupplyDraw {
  sourceId: string;
  voltageV: number;
  currentMa: number;
}

/**
 * Estimates DC current drawn from each bias/supply voltage source (e.g. "Vcc"/"Vdd" in
 * transistor/JFET circuits) by solving the DC operating point and reading the MNA branch current
 * for that source. `inputSourceId` (the audio input, per the "first vsource" convention in
 * netlistFromGraph.ts) is excluded - only power-rail sources are reported.
 *
 * Ideal op-amp-based circuits have no physical supply node in the netlist (the macromodel's
 * rail-clipping is a solver-internal parameter, not a stamped element), so they yield no rows here.
 */
export function estimatePowerSupplyDraw(netlist: Netlist, inputSourceId: string | null): PowerSupplyDraw[] {
  const supplySources = netlist.elements.filter(
    (el): el is VoltageSourceElement => el.type === "vsource" && el.id !== inputSourceId,
  );
  if (supplySources.length === 0) return [];

  const topology = buildTopology(netlist);
  const { solution } = solveNewton(netlist, topology, new Map(), 0);

  return supplySources.map((source) => ({
    sourceId: source.id,
    voltageV: source.voltage,
    currentMa: Math.abs(solution[branchOf(topology, source.id)]) * 1000,
  }));
}
