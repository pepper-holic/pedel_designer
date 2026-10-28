import { blockSymbolLayout, type BlockSymbolLayout } from "./blockGeometry";
import { terminalLeadOutward, terminalPosition, type LeadOutward } from "./geometry";
import type { BlockInstance, PartInstance, TerminalRef, Wire } from "./types";

export interface CanvasEndpoints {
  /** Collapsed-block membership of hidden parts. */
  hidden: Map<string, BlockInstance>;
  /** Box geometry of every collapsed block. */
  layouts: Map<string, BlockSymbolLayout>;
  /** Where a terminal is drawn: its own position, or - inside a collapsed block - the matching port
   * pin (or the box centre if it has no port). Null when the part does not exist. */
  resolve: (ref: TerminalRef) => { x: number; y: number } | null;
  /** The direction a terminal's own lead runs in (see `terminalLeadOutward`), so a router can give it
   * a straight stub before bending instead of turning right at the pin or doubling back across the
   * part's own body. Null for a hidden terminal (a collapsed block's pin has no single physical lead
   * to align with) or a part that does not exist. */
  leadOutward: (ref: TerminalRef) => LeadOutward | null;
  /** Both ends inside the same collapsed block: drawn nowhere, the box stands for it. */
  isHiddenWire: (wire: Wire) => boolean;
}

/**
 * The single place that knows how collapsing changes what is drawn. Wires keep joining real
 * terminals; this maps each end to where it should appear, so the wire, junction, probe and DC
 * layers all agree.
 *
 * A wire end on a hidden terminal that is not itself a port still lands on the right pin when it
 * shares a net with one (e.g. it hits the other end of the input coupling cap's wire) - `netOf`
 * provides that; without it such ends fall back to the box centre.
 */
export function buildCanvasEndpoints(parts: PartInstance[], blocks: BlockInstance[], netOf?: (ref: TerminalRef) => string | undefined): CanvasEndpoints {
  const byId = new Map(parts.map((p) => [p.id, p]));
  const hidden = new Map<string, BlockInstance>();
  const layouts = new Map<string, BlockSymbolLayout>();
  for (const block of blocks) {
    if (!block.collapsed) continue;
    const members = parts.filter((p) => p.blockId === block.id);
    const layout = blockSymbolLayout(block, members);
    if (!layout) continue;
    layouts.set(block.id, layout);
    for (const p of members) hidden.set(p.id, block);
  }

  const resolve = (ref: TerminalRef) => {
    const part = byId.get(ref.partId);
    if (!part) return null;
    const block = hidden.get(part.id);
    if (!block) return terminalPosition(part, ref.terminalId);
    const layout = layouts.get(block.id)!;
    const exact = layout.pins.find((pin) => pin.port.terminal.partId === ref.partId && pin.port.terminal.terminalId === ref.terminalId);
    if (exact) return { x: exact.x, y: exact.y };
    const net = netOf?.(ref);
    const sameNet = net ? layout.pins.find((pin) => netOf!(pin.port.terminal) === net) : undefined;
    return sameNet ? { x: sameNet.x, y: sameNet.y } : { x: layout.cx, y: layout.cy };
  };

  const leadOutward = (ref: TerminalRef): LeadOutward | null => {
    if (hidden.has(ref.partId)) return null;
    const part = byId.get(ref.partId);
    return part ? terminalLeadOutward(part, ref.terminalId) : null;
  };

  const isHiddenWire = (wire: Wire) => {
    const a = hidden.get(wire.a.partId);
    return !!a && a === hidden.get(wire.b.partId);
  };

  return { hidden, layouts, resolve, leadOutward, isHiddenWire };
}
