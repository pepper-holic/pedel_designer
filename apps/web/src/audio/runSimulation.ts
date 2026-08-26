import { runTransient } from "../core/solver/transient";
import type { PedalPreset } from "../core/library/types";

export interface SimulationResult {
  traces: Map<string, Float64Array>;
  outputSamples: Float64Array;
  sampleRate: number;
}

/** Scales normalized [-1,1] audio into volts, runs the circuit through it, and returns every tap-node trace. */
export function runPedalSimulation(
  preset: PedalPreset,
  params: Record<string, number>,
  inputSamples: Float64Array,
  sampleRate: number,
  inputGainVolts: number,
): SimulationResult {
  const netlist = preset.build(params);
  const scaledInput = new Float64Array(inputSamples.length);
  for (let i = 0; i < inputSamples.length; i++) scaledInput[i] = inputSamples[i] * inputGainVolts;

  const { traces } = runTransient(netlist, {
    inputSourceId: preset.inputSourceId,
    inputSamples: scaledInput,
    sampleRate,
    tapNodes: preset.tapNodes,
  });

  const outputSamples = traces.get(preset.outputNode);
  if (!outputSamples) throw new Error(`Preset "${preset.id}" did not tap its declared output node`);

  return { traces, outputSamples, sampleRate };
}
