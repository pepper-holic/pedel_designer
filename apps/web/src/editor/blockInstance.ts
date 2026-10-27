import { buildAnnotatedCircuit } from "./annotatedCircuit";
import { snapToGrid } from "./geometry";
import type { BlockDef } from "./blocks";
import type { BlockInstance, PartInstance, TerminalRef, Wire } from "./types";

// graphFromNetlist lays a fresh netlist out starting near (100, 100) - see ORIGIN_X/ORIGIN_Y in
// graphFromNetlist.ts - so the result is re-based onto the requested position afterwards.
const LAYOUT_ORIGIN_X = 100;
const LAYOUT_ORIGIN_Y = 100;

export interface PlacedBlock {
  parts: PartInstance[];
  wires: Wire[];
  block: BlockInstance;
}

/**
 * Stamps one instance of a library block onto the canvas: builds its circuit, converts its knobs to
 * real potentiometers, resolves its ports to internal terminals, and prefixes every id with
 * `instanceId` so any number of instances (of this or any other block) never collide.
 */
export function instantiateBlock(def: BlockDef, instanceId: string, position: { x: number; y: number }, collapsed = false): PlacedBlock {
  const built = buildAnnotatedCircuit({
    netlist: def.build(),
    layout: def.layout,
    knobs: def.knobs,
    blocks: [{ id: instanceId, label: def.label, category: def.category, elements: def.build().elements.map((e) => e.id), ports: def.ports, collapsed }],
  });
  const prefix = `${instanceId}_`;
  const ref = (r: TerminalRef): TerminalRef => ({ partId: `${prefix}${r.partId}`, terminalId: r.terminalId });
  const dx = position.x - LAYOUT_ORIGIN_X;
  const dy = position.y - LAYOUT_ORIGIN_Y;

  const parts = built.parts.map((p) => ({ ...p, id: `${prefix}${p.id}`, x: snapToGrid(p.x + dx), y: snapToGrid(p.y + dy), blockId: instanceId }));
  const wires = built.wires.map((w) => ({ id: `${prefix}${w.id}`, a: ref(w.a), b: ref(w.b) }));
  const source = built.blocks[0];
  const block: BlockInstance = {
    ...source,
    defId: def.id,
    ports: source.ports.map((p) => ({ ...p, terminal: ref(p.terminal) })),
    params: source.params.map((p) => ({ ...p, id: `${prefix}${p.id}`, partId: `${prefix}${p.partId}` })),
  };
  return { parts, wires, block };
}
