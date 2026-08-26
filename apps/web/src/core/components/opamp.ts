import { branchOf, nodeOf } from "../solver/topology";
import type { OpAmpElement } from "../solver/types";
import type { StampContext } from "./context";

/** Ideal op-amp (nullor model): forces V(in+) = V(in-), output current is unconstrained. */
export function stampOpAmp(el: OpAmpElement, ctx: StampContext): void {
  const inPlus = nodeOf(ctx.topology, el.nodes[0]);
  const inMinus = nodeOf(ctx.topology, el.nodes[1]);
  const out = nodeOf(ctx.topology, el.nodes[2]);
  const branch = branchOf(ctx.topology, el.id);
  ctx.system.stampIdealOpAmp(branch, inPlus, inMinus, out);
}
