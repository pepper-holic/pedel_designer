import { POWER_BLOCKS } from "./power";
import { INPUT_BLOCKS } from "./input";
import { BUFFER_BLOCKS, GAIN_BLOCKS } from "./gain";
import { CLIPPING_BLOCKS } from "./clipping";
import { FUZZ_BLOCKS } from "./fuzz";
import { TONE_BLOCKS } from "./tone";
import { OUTPUT_BLOCKS } from "./output";
import { LOAD_BLOCKS } from "./load";
import type { BlockDef } from "./types";

export type { BlockDef } from "./types";
export { BLOCK_CATEGORY_LABELS, BLOCK_CATEGORY_ORDER } from "./types";

/** Every library block, in signal-path order. Registering a block here is enough for the
 * library-wide sanity tests (blocks.test.ts) to cover it. */
export const BLOCK_DEFS: BlockDef[] = [
  ...POWER_BLOCKS,
  ...INPUT_BLOCKS,
  ...BUFFER_BLOCKS,
  ...GAIN_BLOCKS,
  ...CLIPPING_BLOCKS,
  ...FUZZ_BLOCKS,
  ...TONE_BLOCKS,
  ...OUTPUT_BLOCKS,
  ...LOAD_BLOCKS,
];
