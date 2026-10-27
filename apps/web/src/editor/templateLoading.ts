import { netlistFromGraph } from "./netlistFromGraph";
import { graphFromNetlist, findEquivalentNode } from "./graphFromNetlist";
import type { CircuitSnapshot } from "./historyStack";
import type { PedalPreset, PresetVariant } from "../core/library/presets";
import type { WiringPreset } from "./wiring";

export interface LoadedCircuit {
  snapshot: CircuitSnapshot;
  /** Net name of the preset's output on the freshly built canvas ("" when it could not be found). */
  outputNode: string;
}

/**
 * Lays a pedal preset out on the canvas. Variant params override the defaults, which is what makes a
 * preset's non-default topology branch (King of Tone's clipMode, OCD's brightSwitch) reachable at all.
 *
 * Net names are reassigned by the canvas round-trip, so the preset's output node is located again
 * by electrical equivalence rather than by name.
 */
export function loadPedalPreset(preset: PedalPreset, variant?: PresetVariant): LoadedCircuit {
  const originalNetlist = preset.build({ ...preset.defaultParams, ...(variant?.params ?? {}) });
  const { parts, wires } = graphFromNetlist(originalNetlist, preset.inputSourceId, preset.layout);
  const roundTripped = netlistFromGraph(parts, wires);
  const outputNode = findEquivalentNode(originalNetlist, preset.outputNode, roundTripped.netlist) ?? "";
  return { snapshot: { parts, wires, blocks: [] }, outputNode };
}

/** Wiring presets are stored as a part-level snapshot (see wiring/types.ts), so loading one needs no
 * netlist round-trip, and composite parts (pickup, pots) stay composite. The arrays are module-level
 * constants, so they are deep-copied before they can enter the undo stack. */
export function loadWiringPreset(preset: WiringPreset): LoadedCircuit {
  const parts = preset.snapshot.parts.map((p) => ({ ...p, params: { ...p.params } }));
  const wires = preset.snapshot.wires.map((w) => ({ ...w, a: { ...w.a }, b: { ...w.b } }));
  const outputKey = `${preset.outputTerminal.partId}:${preset.outputTerminal.terminalId}`;
  return {
    snapshot: { parts, wires, blocks: [...preset.snapshot.blocks] },
    outputNode: netlistFromGraph(parts, wires).terminalNet.get(outputKey) ?? "",
  };
}
