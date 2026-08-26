import { nodeOf } from "../solver/topology";
import type { ResistorElement } from "../solver/types";
import type { StampContext } from "./context";

export function stampResistor(el: ResistorElement, ctx: StampContext): void {
  const p = nodeOf(ctx.topology, el.nodes[0]);
  const n = nodeOf(ctx.topology, el.nodes[1]);
  ctx.system.stampConductance(p, n, 1 / el.resistance);
}
