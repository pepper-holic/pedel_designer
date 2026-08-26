import type { Netlist, NodeId } from "../solver/types";

export interface PedalPreset {
  id: string;
  name: string;
  description: string;
  /** Builds a fresh netlist from the current parameter values (fresh element objects, safe to mutate during simulation). */
  build: (params: Record<string, number>) => Netlist;
  inputSourceId: string;
  /** Node(s) worth plotting: typically ["in", ...intermediate stages..., "out"]. */
  tapNodes: NodeId[];
  outputNode: NodeId;
  defaultParams: Record<string, number>;
}
