import { runTransient } from "../solver/transient";
import type { Netlist, NodeId } from "../solver/types";

export interface ChainStage {
  netlist: Netlist;
  inputSourceId: string;
  outputNode: NodeId;
}

/**
 * Runs several circuits in series - each stage's output trace becomes the next stage's input
 * samples, exactly like plugging one pedal's output into the next pedal's input. Stages keep their
 * own independent Newton/companion-model state (no shared topology), so this works for any mix of
 * circuits regardless of how they were built.
 */
export function runChainedTransient(stages: ChainStage[], inputSamples: Float64Array, sampleRate: number): Float64Array {
  let current = inputSamples;
  for (const stage of stages) {
    const { traces } = runTransient(stage.netlist, {
      inputSourceId: stage.inputSourceId,
      inputSamples: current,
      sampleRate,
      tapNodes: [stage.outputNode],
    });
    current = traces.get(stage.outputNode)!;
  }
  return current;
}
