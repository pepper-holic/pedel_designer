import { GROUND } from "../../core/solver/types";
import type { BlockDef } from "./types";

/** Typical instrument-cable capacitance per metre (real cables run ~100-150 pF/m). */
const CABLE_PF_PER_METER = 125;

/**
 * What a passive pickup actually drives: cable capacitance plus the amp/pedal input impedance - the
 * pair that moves a pickup's resonant peak (docs/plan-guitar-wiring.md §5).
 */
export const cableAndAmpLoadBlock: BlockDef = {
  id: "cable-amp-load",
  label: "케이블 + 앰프 입력 부하",
  category: "load",
  description: "3m 기타 케이블의 정전용량과 1MΩ 앰프 입력 임피던스 - 패시브 픽업의 공진과 고음을 좌우하는 부하",
  ports: [{ kind: "in", node: "in" }],
  build: () => ({
    elements: [
      { id: "Ccable", type: "capacitor", nodes: ["in", GROUND], capacitance: 3 * CABLE_PF_PER_METER * 1e-12 },
      { id: "Rin", type: "resistor", nodes: ["in", GROUND], resistance: 1_000_000 },
    ],
  }),
  layout: { Ccable: { x: 100, y: 100 }, Rin: { x: 240, y: 100 } },
};

export const LOAD_BLOCKS = [cableAndAmpLoadBlock];
