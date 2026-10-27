import { GROUND } from "../../core/solver/types";
import { applyTaper } from "../taper";
import { IN_OUT, type BlockDef } from "./types";

const VOLUME_POT = 100_000;
const VOLUME_START = applyTaper("A", 0.7);

/** Coupling cap into an audio-taper volume pot - the last thing in almost every pedal. */
export const outputVolumeBlock: BlockDef = {
  id: "output-volume",
  label: "출력 볼륨",
  category: "output",
  description: "출력 커플링 캡 + 100kΩ A커브 볼륨 노브 - 대부분 페달의 마지막 단",
  ports: IN_OUT,
  knobs: [{ kind: "pot", id: "VOLUME", label: "VOLUME", upper: "Rvola", lower: "Rvolb", taper: "A" }],
  build: () => ({
    elements: [
      { id: "Cout", type: "capacitor", nodes: ["in", "hot"], capacitance: 1e-6 },
      // Lug a grounded, lug b hot: turning up moves the wiper towards the signal.
      { id: "Rvola", type: "resistor", nodes: [GROUND, "out"], resistance: VOLUME_POT * VOLUME_START },
      { id: "Rvolb", type: "resistor", nodes: ["out", "hot"], resistance: VOLUME_POT * (1 - VOLUME_START) },
    ],
  }),
};

export const OUTPUT_BLOCKS = [outputVolumeBlock];
