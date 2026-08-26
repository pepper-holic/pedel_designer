import { branchOf, nodeOf } from "../solver/topology";
import type { VoltageSourceElement } from "../solver/types";
import type { StampContext } from "./context";

export function stampVoltageSource(el: VoltageSourceElement, ctx: StampContext): void {
  const p = nodeOf(ctx.topology, el.nodes[0]);
  const n = nodeOf(ctx.topology, el.nodes[1]);
  const branch = branchOf(ctx.topology, el.id);
  ctx.system.stampVoltageSource(branch, p, n, el.voltage);
}
