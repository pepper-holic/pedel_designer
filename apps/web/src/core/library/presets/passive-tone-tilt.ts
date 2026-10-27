import type { PedalPreset } from "../types";

const POT_TOTAL = 100_000;
const MIN_SERIES = 50; // avoid a literal 0-ohm series leg at the pot's brightest extreme

/**
 * Classic passive tone control: a variable series resistance (the pot) into
 * a fixed shunt capacitor to ground. Turning the knob down raises the
 * series resistance, pulling the RC low-pass corner down into the audible
 * range and darkening the signal; turning it up moves the corner out of
 * hearing range for a nearly unfiltered pass-through.
 */
export const passiveToneTiltPreset: PedalPreset = {
  id: "passive-tone-tilt",
  name: "톤스택 (패시브 톤 컨트롤)",
  description: "가변 직렬 저항(포트) + 고정 션트 커패시터 - 저역통과 코너 주파수를 노브로 조절",
  category: "톤/EQ",
  inputSourceId: "V1",
  tapNodes: ["in", "out"],
  outputNode: "out",
  defaultParams: {
    tone: 0.5, // 0 = darkest (max series resistance), 1 = brightest (near-zero series resistance)
    shuntCapacitance: 4.7e-9,
  },
  // Functional decomposition (docs/plan-core-fundamentals.md B-5): loads as labelled blocks that can be
  // collapsed into black boxes; knobs load as real potentiometers.
  blocks: [
    { id: "tone", label: "패시브 톤", category: "tone", elements: ["Rtone", "Cshunt"], ports: [{ kind: "in", node: "in" }, { kind: "out", node: "out" }] },
  ],
  knobs: [
    { kind: "rheostat", id: "TONE", label: "TONE", element: "Rtone", maxResistance: 100_000, taper: "B", reverse: true },
  ],
  build: (params) => {
    const seriesResistance = Math.max(POT_TOTAL * (1 - params.tone), MIN_SERIES);
    return {
      elements: [
        { id: "V1", type: "vsource", nodes: ["in", "0"], voltage: 0 },
        { id: "Rtone", type: "resistor", nodes: ["in", "out"], resistance: seriesResistance },
        { id: "Cshunt", type: "capacitor", nodes: ["out", "0"], capacitance: params.shuntCapacitance },
      ],
    };
  },
};
