import { describe, expect, it } from "vitest";
import { buildTopology } from "../../src/core/solver/topology";
import { solveNewton } from "../../src/core/solver/newton";
import { voltageAt } from "../../src/core/solver/solution";
import { runAcAnalysis } from "../../src/core/solver/ac";
import { fuzzGermaniumPreset, passiveToneTiltPreset, activeShelfEqPreset } from "../../src/core/library/presets";

describe("Fuzz Face style germanium fuzz", () => {
  it("biases Q2's collector between the negative rail and ground, not slammed into either", () => {
    const netlist = fuzzGermaniumPreset.build(fuzzGermaniumPreset.defaultParams);
    const topology = buildTopology(netlist);
    const { solution } = solveNewton(netlist, topology, new Map(), 0);
    const outc = voltageAt(topology, solution, "outc");

    expect(outc).toBeLessThan(-0.3);
    expect(outc).toBeGreaterThan(-8.7);
  });
});

describe("Passive tone control", () => {
  it("attenuates 5kHz more when the knob is turned dark (tone=0) than bright (tone=1)", () => {
    const darkNetlist = passiveToneTiltPreset.build({ ...passiveToneTiltPreset.defaultParams, tone: 0 });
    const brightNetlist = passiveToneTiltPreset.build({ ...passiveToneTiltPreset.defaultParams, tone: 1 });

    const [darkPoint] = runAcAnalysis(darkNetlist, { inputSourceId: "V1", outputNode: "out", frequenciesHz: [5000] });
    const [brightPoint] = runAcAnalysis(brightNetlist, { inputSourceId: "V1", outputNode: "out", frequenciesHz: [5000] });

    expect(darkPoint.magnitudeDb).toBeLessThan(brightPoint.magnitudeDb - 10);
  });
});

describe("Active shelving EQ", () => {
  it("boosts high frequencies more than low frequencies when tone > 0, and stays flat at tone = 0", () => {
    const shelfNetlist = activeShelfEqPreset.build({ ...activeShelfEqPreset.defaultParams, tone: 1 });
    const flatNetlist = activeShelfEqPreset.build({ ...activeShelfEqPreset.defaultParams, tone: 0 });

    const shelfPoints = runAcAnalysis(shelfNetlist, { inputSourceId: "V1", outputNode: "out", frequenciesHz: [100, 8000] });
    const flatPoints = runAcAnalysis(flatNetlist, { inputSourceId: "V1", outputNode: "out", frequenciesHz: [100, 8000] });

    expect(shelfPoints[1].magnitudeDb).toBeGreaterThan(shelfPoints[0].magnitudeDb + 6);
    expect(flatPoints[1].magnitudeDb).toBeCloseTo(flatPoints[0].magnitudeDb, 1);
  });
});
