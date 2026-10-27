import type { PedalPreset } from "../types";

/** Unity-gain op-amp buffer: isolates the input source from whatever follows. */
export const bufferPreset: PedalPreset = {
  id: "buffer",
  name: "버퍼 (Op-Amp Follower)",
  description: "이상적 연산증폭기 유닛 버퍼 - 입력을 그대로 출력",
  category: "버퍼",
  inputSourceId: "V1",
  tapNodes: ["in", "out"],
  outputNode: "out",
  defaultParams: {},
  // Functional decomposition (docs/plan-core-fundamentals.md B-5): loads as labelled blocks that can be
  // collapsed into black boxes; knobs load as real potentiometers.
  blocks: [
    { id: "buffer", label: "버퍼 (Op-Amp 팔로워)", category: "buffer", elements: ["U1"], ports: [{ kind: "in", node: "in" }, { kind: "out", node: "out" }] },
  ],
  build: () => ({
    elements: [
      { id: "V1", type: "vsource", nodes: ["in", "0"], voltage: 0 },
      { id: "U1", type: "opamp", nodes: ["in", "out", "out"], openLoopGain: 1e5 },
    ],
  }),
};
