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
  /**
   * Optional hand-picked canvas coordinates, keyed by element id, that override the automatic
   * BFS signal-flow layout when loading this preset as a template. Wiring is still derived
   * entirely from the netlist (`graphFromNetlist`) - this only fixes part positions for presets
   * where the automatic grid layout produces excessive wire crossing. Elements not listed here
   * (or every element, if the field is omitted) fall back to the automatic layout.
   */
  layout?: Record<string, { x: number; y: number }>;
}
