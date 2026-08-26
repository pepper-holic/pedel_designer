import type { PedalPreset } from "../types";

/** Unity-gain op-amp buffer: isolates the input source from whatever follows. */
export const bufferPreset: PedalPreset = {
  id: "buffer",
  name: "버퍼 (Op-Amp Follower)",
  description: "이상적 연산증폭기 유닛 버퍼 - 입력을 그대로 출력",
  inputSourceId: "V1",
  tapNodes: ["in", "out"],
  outputNode: "out",
  defaultParams: {},
  build: () => ({
    elements: [
      { id: "V1", type: "vsource", nodes: ["in", "0"], voltage: 0 },
      { id: "U1", type: "opamp", nodes: ["in", "out", "out"], openLoopGain: 1e5 },
    ],
  }),
};
