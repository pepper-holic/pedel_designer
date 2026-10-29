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

/** Functional role of a block - decides its colour and where it sits in the library. */
export type BlockCategory = "input" | "buffer" | "gain" | "clipping" | "fuzz" | "tone" | "output" | "power" | "load" | "custom";

/** What a block's connection point is for. Decides which side of the collapsed symbol it sits on
 * (in/aux left, out right, supply/bias top, ground bottom) and how it is labelled. */
export type PortKind = "in" | "out" | "supply" | "bias" | "ground" | "aux";

/**
 * A real knob hidden inside a netlist. Netlists only know resistors, so a pot is described as the
 * two resistors either side of its wiper, or a variable resistor as one resistor and its maximum. On
 * the canvas these become one potentiometer part the user can turn.
 */
export type KnobSpec =
  | {
      kind: "pot";
      /** Part id of the potentiometer on the canvas (e.g. "TONE"). */
      id: string;
      label: string;
      /** Resistor between the pot's "a" lug and the wiper. */
      upper: string;
      /** Resistor between the wiper and the "b" lug. Must share exactly one node with `upper`. */
      lower: string;
      taper?: "A" | "B" | "C";
    }
  | {
      kind: "rheostat";
      id: string;
      label: string;
      /** The resistor whose value the knob sets; its first node becomes lug "a", its second the wiper. */
      element: string;
      maxResistance: number;
      taper?: "A" | "B" | "C";
      /** Wire it the other way round, so turning up *lowers* the resistance (e.g. a series tone
       * control where clockwise should be brighter). */
      reverse?: boolean;
    };

export interface PortSpec {
  kind: PortKind;
  /** Node of the netlist the port exposes. */
  node: NodeId;
  label?: string;
  id?: string;
}

/**
 * One functional block within a netlist: which elements belong to it and where it connects out.
 * Element ids missing from a particular build (a topology variant that drops them) are ignored, so
 * one annotation can cover every variant of a preset.
 */
export interface BlockAnnotation {
  id: string;
  label: string;
  category: BlockCategory;
  elements: string[];
  ports: PortSpec[];
  collapsed?: boolean;
}

/** A hand-picked spot for one part. Rotation/mirror are honoured for kit circuits, whose layout is
 * a complete hand-drawn schematic (every part pinned there, then grounds hung and nets rewired). */
export interface LayoutSpot {
  x: number;
  y: number;
  rotation?: 0 | 90 | 180 | 270;
  mirror?: boolean;
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
  layout?: Record<string, LayoutSpot>;
  /**
   * The preset decomposed into functional blocks (input, gain, clipping, tone, output, power...),
   * so it loads as labelled stages that can be collapsed into black boxes. Every element except the
   * audio input source belongs to exactly one block (enforced by preset-blocks.test.ts).
   */
  blocks?: BlockAnnotation[];
  /** Resistors that are really knobs on the pedal - loaded as potentiometers the user can turn. */
  knobs?: KnobSpec[];
  /**
   * Present only for presets re-derived from publicly documented, community DIY circuit topologies
   * (see docs/plan-circuit-archive.md) rather than designed from scratch for this app. Component
   * values here are representative approximations reconstructed from public descriptions, not a
   * trace of any specific commercial product's exact schematic - `name`/`description` intentionally
   * describe the circuit's *style* rather than naming a trademarked product.
   */
  /** Present on presets generated from a DIY kit's board (core/library/kits): which kit, and the
   * pedal it reproduces, so the library can list them as kits. */
  kit?: { goodsNo: string; kitName: string; motif: string; family: string };
  archive?: {
    /** Public reference material consulted for the general topology/values - not copied text or images. */
    sourceRefs: { label: string; url: string }[];
    disclaimer: string;
  };
}
