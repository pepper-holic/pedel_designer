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

export type BlockCategory = "buffer" | "gain" | "clipping" | "tone" | "load";

/** A functional block (e.g. one "게인 스테이지" instance) stamped onto the canvas: a group of parts
 * + internal wires added together from a BlockDef, tracked here only for the schematic canvas's
 * tinted-region overlay and "delete whole block" - the parts themselves are otherwise ordinary,
 * independently wirable/editable PartInstances. */
export interface BlockInstance {
  id: string;
  defId: string;
  label: string;
  category: BlockCategory;
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
