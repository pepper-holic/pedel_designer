import { GROUND, type Netlist, type NodeId, type OpAmpElement } from "./types";
import { bufferBranchId, needsInternalNode, hasGbwp, poleNodeId } from "../components/opamp";

/**
 * Static structure of a circuit: which node each terminal maps to, and how
 * many extra "branch current" unknowns the network needs (voltage sources,
 * op-amps). This is computed once per netlist and reused across every
 * timestep / Newton iteration, since only stamped values change, not shape.
 */
export interface CircuitTopology {
  nodeIndex: Map<NodeId, number>;
  numNodes: number;
  branchIndex: Map<string, number>;
  numBranches: number;
  size: number;
}

const BRANCHES_PER_ELEMENT: Record<string, number> = {
  vsource: 1,
};

export function buildTopology(netlist: Netlist): CircuitTopology {
  const nodeIndex = new Map<NodeId, number>();
  for (const element of netlist.elements) {
    for (const node of element.nodes) {
      if (node === GROUND || nodeIndex.has(node)) continue;
      nodeIndex.set(node, nodeIndex.size);
    }
  }
  for (const element of netlist.elements) {
    if (element.type !== "opamp") continue;
    const el = element as OpAmpElement;
    if (needsInternalNode(el)) nodeIndex.set(poleNodeId(el.id), nodeIndex.size);
  }

  const branchIndex = new Map<string, number>();
  let numBranches = 0;
  const addBranch = (key: string) => {
    branchIndex.set(key, nodeIndex.size + numBranches);
    numBranches += 1;
  };
  for (const element of netlist.elements) {
    if (element.type === "opamp") {
      const el = element as OpAmpElement;
      if (!hasGbwp(el)) {
        addBranch(el.id);
      } else {
        addBranch(bufferBranchId(el.id));
      }
      continue;
    }
    const count = BRANCHES_PER_ELEMENT[element.type] ?? 0;
    if (count === 0) continue;
    addBranch(element.id);
  }

  const numNodes = nodeIndex.size;
  return { nodeIndex, numNodes, branchIndex, numBranches, size: numNodes + numBranches };
}

export function nodeOf(topology: CircuitTopology, node: NodeId): number {
  if (node === GROUND) return -1;
  const index = topology.nodeIndex.get(node);
  if (index === undefined) throw new Error(`Unknown node: ${node}`);
  return index;
}

export function branchOf(topology: CircuitTopology, elementId: string): number {
  const index = topology.branchIndex.get(elementId);
  if (index === undefined) throw new Error(`Element has no branch unknown: ${elementId}`);
  return index;
}
