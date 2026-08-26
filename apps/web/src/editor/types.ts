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
