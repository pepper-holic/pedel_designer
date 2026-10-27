import type { Netlist } from "../../core/solver/types";
import type { BlockCategory } from "../types";
import type { KnobSpec, PortSpec } from "../annotatedCircuit";

/**
 * A library block: a small, self-contained functional circuit with named ports and knobs. Placed on
 * the canvas it becomes ordinary parts grouped as one block, so it can be used collapsed as a black
 * box (wire its pins, turn its knobs) or expanded to edit any part inside.
 *
 * Ground is shared by every block through its local ground symbols, so it is never a port. Blocks
 * that need power take it on a `supply` port - wire it to a power block's 9V pin.
 */
export interface BlockDef {
  id: string;
  label: string;
  category: BlockCategory;
  description: string;
  /** The circuit at its default settings. Node names used by `ports` must appear in it. */
  build: () => Netlist;
  ports: PortSpec[];
  knobs?: KnobSpec[];
  layout?: Record<string, { x: number; y: number }>;
}

export const BLOCK_CATEGORY_LABELS: Record<BlockCategory, string> = {
  input: "입력",
  buffer: "버퍼",
  gain: "증폭 단",
  clipping: "클리핑 단",
  fuzz: "퍼즈",
  tone: "톤 스택",
  output: "출력",
  power: "전원",
  load: "부하",
  custom: "사용자 블록",
};

/** The order categories appear in the library, following the signal path. */
export const BLOCK_CATEGORY_ORDER: BlockCategory[] = ["power", "input", "buffer", "gain", "clipping", "fuzz", "tone", "output", "load", "custom"];

export const IN_OUT: PortSpec[] = [
  { kind: "in", node: "in" },
  { kind: "out", node: "out" },
];

export const IN_OUT_SUPPLY: PortSpec[] = [...IN_OUT, { kind: "supply", node: "vcc", label: "V+" }];
