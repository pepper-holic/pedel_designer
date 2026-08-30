import { graphFromNetlist } from "./graphFromNetlist";
import { snapToGrid } from "./geometry";
import type { BlockDef } from "./blockDefs";
import type { BlockInstance, PartInstance, TerminalRef, Wire } from "./types";

// graphFromNetlist always lays a fresh netlist out starting near (100, 100) - see ORIGIN_X/ORIGIN_Y
// in graphFromNetlist.ts. There's no parameter to change that, so instantiateBlock re-bases the
// result onto the caller's requested position afterward instead.
const LAYOUT_ORIGIN_X = 100;
const LAYOUT_ORIGIN_Y = 100;

function remapTerminal(ref: TerminalRef, idPrefix: string): TerminalRef {
  return { partId: `${idPrefix}${ref.partId}`, terminalId: ref.terminalId };
}

/**
 * Stamps one instance of a block def onto the canvas: builds its internal sub-circuit, lays it out
 * via the same signal-flow layout used for whole-pedal presets, then prefixes every part/wire id
 * with `instanceId` (so multiple instances of the same block, or of different blocks, never collide)
 * and tags every part with `blockId` for the canvas's tinted-region overlay. Any node in the block's
 * netlist referenced by only one terminal (typically "in"/"out") comes out as a free, unwired
 * terminal ready for the user to wire to whatever's next - blocks are pre-wired *inside*, not
 * pre-connected to each other.
 */
export function instantiateBlock(def: BlockDef, instanceId: string, position: { x: number; y: number }): { parts: PartInstance[]; wires: Wire[]; block: BlockInstance } {
  const netlist = def.netlist(def.defaultParams);
  const { parts, wires } = graphFromNetlist(netlist, undefined, def.layout);

  const idPrefix = `${instanceId}_`;
  const dx = position.x - LAYOUT_ORIGIN_X;
  const dy = position.y - LAYOUT_ORIGIN_Y;

  const remappedParts: PartInstance[] = parts.map((part) => ({
    ...part,
    id: `${idPrefix}${part.id}`,
    x: snapToGrid(part.x + dx),
    y: snapToGrid(part.y + dy),
    blockId: instanceId,
  }));

  const remappedWires: Wire[] = wires.map((wire) => ({
    id: `${idPrefix}${wire.id}`,
    a: remapTerminal(wire.a, idPrefix),
    b: remapTerminal(wire.b, idPrefix),
  }));

  return {
    parts: remappedParts,
    wires: remappedWires,
    block: { id: instanceId, defId: def.id, label: def.label, category: def.category },
  };
}
