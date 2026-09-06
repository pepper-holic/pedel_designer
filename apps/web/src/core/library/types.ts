import type { Netlist, NodeId } from "../solver/types";

/** Coarse circuit-family grouping used to organize the template explorer tree. Assigned from the
 * genre word already in each preset's `name` (e.g. "오버드라이브 (...)" -> "오버드라이브") so the
 * grouping stays consistent with what the preset calls itself. */
export type PresetCategory = "버퍼" | "부스트" | "오버드라이브" | "디스토션" | "퍼즈" | "톤/EQ";

/**
 * A named parameter set that changes a preset's *topology* rather than just a component value the
 * user could edit on the canvas afterwards. Presets whose `build()` branches on a parameter list
 * their branches here so the non-default branch is reachable from the library UI at all - loading a
 * preset always builds from `defaultParams`, so without this the other branch had no way in.
 */
export interface PresetVariant {
  id: string;
  label: string;
  /** Merged over `defaultParams` when this variant is loaded. */
  params: Record<string, number>;
}

export interface PedalPreset {
  id: string;
  name: string;
  description: string;
  category: PresetCategory;
  /** Builds a fresh netlist from the current parameter values (fresh element objects, safe to mutate during simulation). */
  build: (params: Record<string, number>) => Netlist;
  inputSourceId: string;
  /** Node(s) worth plotting: typically ["in", ...intermediate stages..., "out"]. */
  tapNodes: NodeId[];
  outputNode: NodeId;
  defaultParams: Record<string, number>;
  /** Selectable topology branches, shown as sub-rows under this preset in the library explorer.
   * The first entry should be the one `defaultParams` already produces. */
  variants?: PresetVariant[];
  /**
   * Optional hand-picked canvas coordinates, keyed by element id, that override the automatic
   * BFS signal-flow layout when loading this preset as a template. Wiring is still derived
   * entirely from the netlist (`graphFromNetlist`) - this only fixes part positions for presets
   * where the automatic grid layout produces excessive wire crossing. Elements not listed here
   * (or every element, if the field is omitted) fall back to the automatic layout.
   */
  layout?: Record<string, { x: number; y: number }>;
  /**
   * Present only for presets re-derived from publicly documented, community DIY circuit topologies
   * (see docs/plan-circuit-archive.md) rather than designed from scratch for this app. Component
   * values here are representative approximations reconstructed from public descriptions, not a
   * trace of any specific commercial product's exact schematic - `name`/`description` intentionally
   * describe the circuit's *style* rather than naming a trademarked product.
   */
  archive?: {
    /** Public reference material consulted for the general topology/values - not copied text or images. */
    sourceRefs: { label: string; url: string }[];
    disclaimer: string;
  };
}
