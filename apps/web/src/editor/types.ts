import type { PartType } from "./partDefs";

export type Rotation = 0 | 90 | 180 | 270;

export interface PartInstance {
  id: string;
  type: PartType;
  x: number;
  y: number;
  /** Degrees clockwise, in 90-degree steps. */
  rotation: Rotation;
  params: Record<string, number | string>;
  /** Set when this part was stamped onto the canvas as part of a functional block (buffer, gain
   * stage, clipper, tone stack, ...) rather than added one at a time - see BlockInstance. */
  blockId?: string;
}

export type BlockCategory = "buffer" | "gain" | "clipping" | "tone";

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
