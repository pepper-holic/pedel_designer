import type { PartType } from "./partDefs";

export type Rotation = 0 | 90 | 180 | 270;

/**
 * What a voltage source is doing in the circuit. Only meaningful on `vsource` parts.
 *
 * Without this, "which source is the audio input" was decided by array order (the first `vsource`
 * found), which breaks as soon as a part stamps its own source - a pickup carries a signal source,
 * a transistor gain stage carries a supply rail. Leaving it undefined keeps the old array-order
 * behaviour, so existing circuits and saved data need no migration.
 */
export type PartRole = "signalSource" | "supply" | "bias";

export interface PartInstance {
  id: string;
  type: PartType;
  x: number;
  y: number;
  /** Degrees clockwise, in 90-degree steps. */
  rotation: Rotation;
  params: Record<string, number | string>;
  /** Only set on voltage sources - see PartRole. Undefined means "unclassified", which the input
   * source lookup treats as a possible audio input for backward compatibility. */
  role?: PartRole;
  /** Set when this part was stamped onto the canvas as part of a functional block (buffer, gain
   * stage, clipper, tone stack, ...) rather than added one at a time - see BlockInstance. */
  blockId?: string;
}

export type BlockCategory = "input" | "buffer" | "gain" | "clipping" | "fuzz" | "tone" | "output" | "power" | "load" | "custom";

/** What a block's connection point is for. Decides which side of the collapsed symbol it sits on
 * (in/aux left, out right, supply/bias top, ground bottom) and how it is labelled. */
export type PortKind = "in" | "out" | "supply" | "bias" | "ground" | "aux";

/**
 * A block's connection point to the rest of the circuit. It names a real terminal *inside* the
 * block, so wires always connect part to part and the netlist never has to know blocks exist -
 * collapsing a block only changes how those wires are drawn (to the port's pin on the box).
 */
export interface BlockPort {
  id: string;
  label: string;
  kind: PortKind;
  terminal: TerminalRef;
}

/** A parameter inside the block surfaced on the block itself - the knobs a black-box user turns
 * without opening it up (a pot's position, a switch, a gain-setting resistor). */
export interface BlockParam {
  id: string;
  label: string;
  partId: string;
  paramKey: string;
}

/**
 * A functional block (e.g. one "게인 스테이지" instance): a group of ordinary parts plus how the
 * group presents itself. Expanded, it is a tinted region over its parts; collapsed, it is a box with
 * port pins and knob names, and its parts and internal wires are hidden.
 */
export interface BlockInstance {
  id: string;
  /** Library definition it was stamped from, or null for a block the user grouped by hand. */
  defId: string | null;
  label: string;
  category: BlockCategory;
  ports: BlockPort[];
  params: BlockParam[];
  /** Collapsed blocks draw as a box centred on their parts' bounding box - deriving the position
   * from the parts (rather than storing one) means dragging, nudging or undoing parts can never
   * leave the box somewhere else. */
  collapsed: boolean;
}

export interface TerminalRef {
  partId: string;
  terminalId: string;
}

export interface Wire {
  id: string;
  a: TerminalRef;
  b: TerminalRef;
}

/**
 * A measurement point the user pinned on the canvas. Anchored to a terminal rather than a net name,
 * because net names ("n1", "n2", ...) are reassigned by union-find on every edit and are not stable
 * properties of the circuit - the same reason WiringPreset.outputTerminal is a terminal.
 */
export interface Probe {
  id: string;
  terminal: TerminalRef;
  /** User-facing name ("P1", or whatever the user renamed it to - e.g. "클리핑 전"). */
  label: string;
  color: string;
}
