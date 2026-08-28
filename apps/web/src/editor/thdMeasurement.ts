import type { Netlist, NodeId } from "../core/solver/types";
import { runTransient } from "../core/solver/transient";
import { computeThd, type ThdResult } from "../core/analysis/thd";
import { generateSineWave } from "../audio/testTone";

export const THD_TEST_FREQ_HZ = 1000;
const THD_TEST_SAMPLE_RATE = 48000;
const THD_TEST_DURATION_SEC = 0.1;
const THD_TEST_AMPLITUDE_V = 0.5;

/** Drives the circuit with an internally synthesized 1kHz test tone and measures THD at outputNode. */
export function measureThd(netlist: Netlist, inputSourceId: string, outputNode: NodeId): ThdResult {
  const inputSamples = generateSineWave(THD_TEST_FREQ_HZ, THD_TEST_AMPLITUDE_V, THD_TEST_SAMPLE_RATE, THD_TEST_DURATION_SEC);
  const { traces } = runTransient(netlist, {
    inputSourceId,
    inputSamples,
    sampleRate: THD_TEST_SAMPLE_RATE,
    tapNodes: [outputNode],
  });
  // Skip the initial transient settling time (coupling caps charging) - keep the steady-state tail.
  const settled = traces.get(outputNode)!.slice(Math.floor(inputSamples.length / 2));
  return computeThd(settled, THD_TEST_SAMPLE_RATE, THD_TEST_FREQ_HZ);
}
