import { buildTopology, branchOf, nodeOf } from "./topology";
import { solveNewton } from "./newton";
import { voltageAt } from "./solution";
import { solveComplexLinear } from "./complexLinear";
import { linearizeBjt } from "../components/bjt";
import { bufferBranchId, clipSlope, hasGbwp, hasRailClipping, integratorGm, POLE_CAPACITANCE, poleNodeId } from "../components/opamp";
import { hasSeriesResistance, seriesNodeId } from "../components/diode";
import type { Netlist, NodeId } from "./types";

export interface AcOptions {
  /** The vsource element driven with a unit AC magnitude; every other source is AC-grounded (superposition). */
  inputSourceId: string;
  outputNode: NodeId;
  frequenciesHz: number[];
}

/** Generates a log-spaced frequency sweep, e.g. logFrequencySweep(20, 20000, 40) for a guitar-range Bode plot. */
export function logFrequencySweep(minHz: number, maxHz: number, pointsPerDecade: number): number[] {
  const decades = Math.log10(maxHz / minHz);
  const count = Math.ceil(decades * pointsPerDecade);
  const frequencies: number[] = [];
  for (let i = 0; i <= count; i++) {
    frequencies.push(minHz * 10 ** ((i / count) * decades));
  }
  return frequencies;
}

export interface AcPoint {
  frequencyHz: number;
  magnitudeDb: number;
  phaseDeg: number;
}

/**
 * Small-signal frequency response: finds the DC operating point, freezes
 * every nonlinear device's conductance there, then sweeps frequency solving
 * a complex-valued linear MNA system per point (device capacitances and
 * op-amp gain rolloff are not modeled - fine for the passive/clipping
 * networks this tool targets first).
 */
export function runAcAnalysis(netlist: Netlist, options: AcOptions): AcPoint[] {
  const topology = buildTopology(netlist);
  const dcSolution = solveNewton(netlist, topology, new Map(), 0);
  const outIndex = nodeOf(topology, options.outputNode);

  return options.frequenciesHz.map((frequencyHz) => {
    const omega = 2 * Math.PI * frequencyHz;
    const n = topology.size;
    const reA = new Float64Array(n * n);
    const imA = new Float64Array(n * n);
    const reZ = new Float64Array(n);
    const imZ = new Float64Array(n);

    const addRe = (row: number, col: number, v: number) => {
      if (row < 0 || col < 0) return;
      reA[row * n + col] += v;
    };
    const addIm = (row: number, col: number, v: number) => {
      if (row < 0 || col < 0) return;
      imA[row * n + col] += v;
    };
    const stampG = (p: number, ni: number, g: number) => {
      addRe(p, p, g);
      addRe(ni, ni, g);
      addRe(p, ni, -g);
      addRe(ni, p, -g);
    };
    const stampB = (p: number, ni: number, susceptance: number) => {
      addIm(p, p, susceptance);
      addIm(ni, ni, susceptance);
      addIm(p, ni, -susceptance);
      addIm(ni, p, -susceptance);
    };

    for (const el of netlist.elements) {
      switch (el.type) {
        case "resistor": {
          const [p, ni] = el.nodes.map((node) => nodeOf(topology, node));
          stampG(p, ni, 1 / el.resistance);
          break;
        }
        case "capacitor": {
          const [p, ni] = el.nodes.map((node) => nodeOf(topology, node));
          stampB(p, ni, omega * el.capacitance);
          break;
        }
        case "inductor": {
          const [p, ni] = el.nodes.map((node) => nodeOf(topology, node));
          if (omega > 0) stampB(p, ni, -1 / (omega * el.inductance));
          break;
        }
        case "vsource": {
          const p = nodeOf(topology, el.nodes[0]);
          const ni = nodeOf(topology, el.nodes[1]);
          const branch = branchOf(topology, el.id);
          addRe(branch, p, 1);
          addRe(branch, ni, -1);
          addRe(p, branch, 1);
          addRe(ni, branch, -1);
          if (el.id === options.inputSourceId) reZ[branch] += 1; // unit AC magnitude, 0 phase
          break;
        }
        case "diode": {
          const p = nodeOf(topology, el.nodes[0]);
          const ni = nodeOf(topology, el.nodes[1]);
          const veff = el.emissionCoefficient * el.thermalVoltage;
          const useRs = hasSeriesResistance(el);
          const junctionNodeId = useRs ? seriesNodeId(el.id) : el.nodes[0];
          const junctionP = useRs ? nodeOf(topology, junctionNodeId) : p;
          const vd = voltageAt(topology, dcSolution, junctionNodeId) - voltageAt(topology, dcSolution, el.nodes[1]);
          const id = el.saturationCurrent * (Math.exp(vd / veff) - 1);
          const gd = (id + el.saturationCurrent) / veff;
          if (useRs) stampG(p, junctionP, 1 / el.seriesResistance!);
          stampG(junctionP, ni, gd);
          break;
        }
        case "bjt": {
          const b = nodeOf(topology, el.nodes[0]);
          const c = nodeOf(topology, el.nodes[1]);
          const e = nodeOf(topology, el.nodes[2]);
          const sign = el.polarity === "pnp" ? -1 : 1;
          const vbe = sign * (voltageAt(topology, dcSolution, el.nodes[0]) - voltageAt(topology, dcSolution, el.nodes[2]));
          const vbc = sign * (voltageAt(topology, dcSolution, el.nodes[0]) - voltageAt(topology, dcSolution, el.nodes[1]));
          const { gpi, gmu, gm, go } = linearizeBjt(el, vbe, vbc);
          addRe(b, b, gpi + gmu);
          addRe(b, e, -gpi);
          addRe(b, c, -gmu);
          addRe(c, b, gm + go);
          addRe(c, e, -gm);
          addRe(c, c, -go);
          addRe(e, b, -(gpi + gm + gmu + go));
          addRe(e, e, gpi + gm);
          addRe(e, c, gmu + go);
          break;
        }
        case "opamp": {
          const inPlus = nodeOf(topology, el.nodes[0]);
          const inMinus = nodeOf(topology, el.nodes[1]);
          const out = nodeOf(topology, el.nodes[2]);

          if (!hasGbwp(el)) {
            const branch = branchOf(topology, el.id);
            if (!hasRailClipping(el)) {
              addRe(branch, inPlus, 1);
              addRe(branch, inMinus, -1);
              addRe(out, branch, 1);
            } else {
              // Small-signal slope of the clipped amplifier, frozen at the DC operating point.
              const vp = voltageAt(topology, dcSolution, el.nodes[0]);
              const vm = voltageAt(topology, dcSolution, el.nodes[1]);
              const slope = clipSlope(el.openLoopGain * (vp - vm), el.railPositive!, el.railNegative!);
              const gp = slope * el.openLoopGain;
              addRe(branch, out, 1);
              addRe(branch, inPlus, -gp);
              addRe(branch, inMinus, gp);
              addRe(out, branch, 1);
            }
            break;
          }

          const pole = nodeOf(topology, poleNodeId(el.id));
          const gm = integratorGm(el.gbwpHz!);
          addRe(pole, inPlus, -gm);
          addRe(pole, inMinus, gm);
          if (omega > 0) stampB(pole, -1, omega * POLE_CAPACITANCE);

          const bufferBranch = branchOf(topology, bufferBranchId(el.id));
          const slope = hasRailClipping(el)
            ? clipSlope(voltageAt(topology, dcSolution, poleNodeId(el.id)), el.railPositive!, el.railNegative!)
            : 1;
          addRe(bufferBranch, out, 1);
          addRe(bufferBranch, pole, -slope);
          addRe(out, bufferBranch, 1);
          addRe(pole, bufferBranch, -1);
          break;
        }
      }
    }

    const x = solveComplexLinear(reA, imA, reZ, imZ, n);
    const outRe = outIndex < 0 ? 0 : x.re[outIndex];
    const outIm = outIndex < 0 ? 0 : x.im[outIndex];
    const magnitude = Math.hypot(outRe, outIm); // input magnitude is 1V, so this is the transfer function magnitude directly

    return {
      frequencyHz,
      magnitudeDb: 20 * Math.log10(Math.max(magnitude, 1e-12)),
      phaseDeg: (Math.atan2(outIm, outRe) * 180) / Math.PI,
    };
  });
}
