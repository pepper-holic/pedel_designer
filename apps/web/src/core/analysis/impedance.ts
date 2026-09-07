import { runAcAnalysis } from "../solver/ac";
import type { Netlist, VoltageSourceElement } from "../solver/types";

export interface ImpedancePoint {
  frequencyHz: number;
  magnitudeOhms: number;
}

/** Clamp for the reciprocal, so an open circuit reports a very large number rather than Infinity. */
const MIN_CURRENT_A = 1e-15;

/**
 * The impedance the signal source is driving, swept across frequency.
 *
 * For an ordinary pedal circuit driven by a voltage source this is the circuit's input impedance -
 * the number that says whether the thing in front of it will be loaded. For a pickup the source
 * sits behind the coil, so the reading includes the coil's own resistance and inductance, which is
 * exactly why a passive guitar's figure climbs with frequency and an active one's does not.
 *
 * Derived from the AC sweep's source branch current at unit drive: Z = 1 / |I|.
 */
export function sourceLoadImpedanceSweep(netlist: Netlist, inputSourceId: string, frequenciesHz: number[]): ImpedancePoint[] {
  const source = netlist.elements.find((e): e is VoltageSourceElement => e.type === "vsource" && e.id === inputSourceId);
  if (!source) return [];

  // The output node is irrelevant to the source current, but runAcAnalysis needs a valid one -
  // the source's own positive node always is.
  return runAcAnalysis(netlist, { inputSourceId, outputNode: source.nodes[0], frequenciesHz }).map((p) => ({
    frequencyHz: p.frequencyHz,
    magnitudeOhms: 1 / Math.max(p.sourceCurrentMagA, MIN_CURRENT_A),
  }));
}
