import { GROUND, type NodeId } from "./types";
import type { CircuitTopology } from "./topology";

export function voltageAt(topology: CircuitTopology, solution: Float64Array, node: NodeId): number {
  if (node === GROUND) return 0;
  const index = topology.nodeIndex.get(node);
  if (index === undefined) throw new Error(`Unknown node: ${node}`);
  return solution[index];
}
