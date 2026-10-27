import { netlistFromGraph } from "./netlistFromGraph";
import { buildAnnotatedCircuit } from "./annotatedCircuit";
import { arrangeParts } from "./layout/arrange";
import { rewireNets } from "./layout/rewire";
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
 * Lays a pedal preset out on the canvas: its functional blocks (input, gain, clipping, tone,
 * output, power) as labelled groups, its knobs as real potentiometers, and its tap nodes as probes.
 * Variant params override the defaults, which is what makes a preset's non-default topology branch
 * (King of Tone's clipMode, OCD's brightSwitch) reachable at all.
 */
export function loadPedalPreset(preset: PedalPreset, variant?: PresetVariant): LoadedCircuit {
  const netlist = preset.build({ ...preset.defaultParams, ...(variant?.params ?? {}) });
  const built = buildAnnotatedCircuit({
    netlist,
    inputSourceId: preset.inputSourceId,
    layout: preset.layout,
    blocks: preset.blocks,
    knobs: preset.knobs,
    nodesOfInterest: [preset.outputNode, ...preset.tapNodes],
  });
  // A hand-tuned layout wins; otherwise blocks are laid out in signal order and each net is rewired
  // as its shortest tree (fewer crossings on 22 of the 23 presets than the flat layout - see
  // docs/plan-core-fundamentals.md, Stage C).
  if (!preset.layout) {
    const arranged = rewireNets(arrangeParts({ parts: built.parts, wires: built.wires, blocks: built.blocks }, preset.inputSourceId));
    built.parts = arranged.parts;
    built.wires = arranged.wires;
  }
  const { terminalNet } = netlistFromGraph(built.parts, built.wires);
  const netOf = (node: string) => {
    const ref = built.nodeTerminals.get(node);
    return ref ? terminalNet.get(`${ref.partId}:${ref.terminalId}`) : undefined;
  };

  let probes: Probe[] = [];
  for (const tap of preset.tapNodes) {
    const ref = built.nodeTerminals.get(tap);
    const terminal = ref && terminalNet.get(`${ref.partId}:${ref.terminalId}`) ? terminalOnNet(terminalNet.get(`${ref.partId}:${ref.terminalId}`)!, built.parts, terminalNet) : null;
    if (!terminal) continue;
    const next = toggleProbe(probes, terminal, terminalNet);
    // toggleProbe removes on a repeat net - two tap names on one node should just keep the first.
    if (next.length > probes.length) probes = next.map((p, i) => (i === next.length - 1 ? { ...p, label: tap } : p));
  }
  // Tagged with their preset so the inspector does not present them as hand-grouped.
  const blocks = built.blocks.map((b) => ({ ...b, defId: `preset:${preset.id}` }));
  return { snapshot: { parts: built.parts, wires: built.wires, blocks }, outputNode: netOf(preset.outputNode) ?? "", probes };
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
