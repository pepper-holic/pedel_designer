import { netlistFromGraph } from "./netlistFromGraph";
import { graphFromNetlist, findEquivalentNode } from "./graphFromNetlist";
import type { CircuitSnapshot } from "./historyStack";
import type { PedalPreset, PresetVariant } from "../core/library/presets";
import type { WiringPreset } from "./wiring";
import { toggleProbe } from "./probes";
import type { PartInstance, Probe } from "./types";

export interface LoadedCircuit {
  snapshot: CircuitSnapshot;
  /** Net name of the preset's output on the freshly built canvas ("" when it could not be found). */
  outputNode: string;
  /** Measurement points to start with - a preset's own tap nodes, so its signal path is plotted
   * stage by stage the moment it loads instead of after the user discovers the probe tool. */
  probes: Probe[];
}

/** A terminal on `net`, preferring a non-ground part so the marker sits on the node itself. */
function terminalOnNet(net: string, parts: PartInstance[], terminalNet: Map<string, string>) {
  const types = new Map(parts.map((p) => [p.id, p.type]));
  for (const [key, n] of terminalNet) {
    if (n !== net) continue;
    const [partId, terminalId] = key.split(":");
    if (types.get(partId) !== "ground") return { partId, terminalId };
  }
  return null;
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

  let probes: Probe[] = [];
  for (const tap of preset.tapNodes) {
    const net = findEquivalentNode(originalNetlist, tap, roundTripped.netlist);
    const terminal = net ? terminalOnNet(net, parts, roundTripped.terminalNet) : null;
    if (!terminal) continue;
    const next = toggleProbe(probes, terminal, roundTripped.terminalNet);
    // toggleProbe removes on a repeat net - two tap names on one node should just keep the first.
    if (next.length > probes.length) probes = next.map((p, i) => (i === next.length - 1 ? { ...p, label: tap } : p));
  }
  return { snapshot: { parts, wires, blocks: [] }, outputNode, probes };
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
    // Wiring presets name their output by terminal; that one point is the useful default probe.
    probes: toggleProbe([], preset.outputTerminal, netlistFromGraph(parts, wires).terminalNet).map((p) => ({ ...p, label: "출력" })),
  };
}
