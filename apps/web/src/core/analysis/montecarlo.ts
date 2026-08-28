import { runAcAnalysis } from "../solver/ac";
import type { Element, Netlist, NodeId } from "../solver/types";

export interface MonteCarloOptions {
  /** Uniform +-tolerance% applied independently to every resistor/capacitor/inductor value. */
  tolerancePercent: number;
  iterations: number;
  frequenciesHz: number[];
}

export interface MonteCarloResult {
  frequenciesHz: number[];
  /** One magnitude-dB array per run, in call order - useful for plotting every trace as a band. */
  runs: number[][];
  meanDb: number[];
  minDb: number[];
  maxDb: number[];
}

/** Only passive component values carry manufacturing tolerance in practice - semiconductor SPICE
 * parameters (diode/BJT/JFET/op-amp) are fixed device characteristics, not swept here. */
function perturbElement(el: Element, tolerancePercent: number, rng: () => number): Element {
  const factor = 1 + (rng() * 2 - 1) * (tolerancePercent / 100);
  switch (el.type) {
    case "resistor":
      return { ...el, resistance: el.resistance * factor };
    case "capacitor":
      return { ...el, capacitance: el.capacitance * factor };
    case "inductor":
      return { ...el, inductance: el.inductance * factor };
    default:
      return el;
  }
}

/**
 * Runs the AC frequency-response analysis `iterations` times, each time with every
 * resistor/capacitor/inductor independently perturbed by up to +-tolerancePercent%, and returns
 * per-frequency min/max/mean magnitude - a Monte Carlo estimate of how component tolerance widens
 * the real-world spread around the nominal frequency response.
 */
export function runMonteCarloAc(
  netlist: Netlist,
  inputSourceId: string,
  outputNode: NodeId,
  options: MonteCarloOptions,
  rng: () => number = Math.random,
): MonteCarloResult {
  const n = options.frequenciesHz.length;
  const runs: number[][] = [];

  for (let i = 0; i < options.iterations; i++) {
    const perturbed: Netlist = { elements: netlist.elements.map((el) => perturbElement(el, options.tolerancePercent, rng)) };
    const points = runAcAnalysis(perturbed, { inputSourceId, outputNode, frequenciesHz: options.frequenciesHz });
    runs.push(points.map((p) => p.magnitudeDb));
  }

  const meanDb = new Array(n).fill(0);
  const minDb = new Array(n).fill(Infinity);
  const maxDb = new Array(n).fill(-Infinity);
  for (const run of runs) {
    for (let i = 0; i < n; i++) {
      meanDb[i] += run[i] / options.iterations;
      minDb[i] = Math.min(minDb[i], run[i]);
      maxDb[i] = Math.max(maxDb[i], run[i]);
    }
  }

  return { frequenciesHz: options.frequenciesHz, runs, meanDb, minDb, maxDb };
}
