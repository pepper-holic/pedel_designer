import { describe, expect, it } from "vitest";
import { kitToPreset } from "../../src/core/library/kits/kitToPreset";
import type { KitCircuit } from "../../src/core/library/kits/types";
import { buildTopology } from "../../src/core/solver/topology";
import { solveNewton } from "../../src/core/solver/newton";
import { voltageAt } from "../../src/core/solver/solution";

/** Octavia's gain block: PNP Q1 -> follower Q2 -> Q3, with Q3's collector fed back to Q1's emitter through 47K + 1K.
 * Three junctions in one DC loop make plain Newton swing for ~90 iterations before it settles. */
const octaviaGain: KitCircuit = {
  id: "loop",
  goodsNo: "0",
  kitName: "loop",
  motif: "loop",
  type: "fuzz",
  description: "",
  supply: 9,
  parts: [
    { ref: "C1", kind: "C", value: "100n", nodes: ["in", "n1"] },
    { ref: "R2", kind: "R", value: "680K", nodes: ["n1", "0"] },
    { ref: "R3", kind: "R", value: "820K", nodes: ["n1", "n2"] },
    { ref: "R4", kind: "R", value: "180K", nodes: ["vcc", "n2"] },
    { ref: "C3", kind: "C", value: "33uF", nodes: ["n2", "0"] },
    { ref: "Q1", kind: "Q", part: "2N5087", nodes: { e: "n3", b: "n1", c: "n4" } },
    { ref: "R5", kind: "R", value: "220K", nodes: ["n4", "0"] },
    { ref: "Q2", kind: "Q", part: "2N4401", nodes: { c: "vcc", b: "n4", e: "n6" } },
    { ref: "R7", kind: "R", value: "22K", nodes: ["n6", "0"] },
    { ref: "Q3", kind: "Q", part: "2N4401", nodes: { b: "n6", c: "out", e: "n8" } },
    { ref: "R8", kind: "R", value: "470R", nodes: ["n8", "0"] },
    { ref: "R9", kind: "R", value: "1.2K", nodes: ["vcc", "out"] },
    { ref: "R10", kind: "R", value: "47K", nodes: ["out", "n9"] },
    { ref: "R11", kind: "R", value: "1K", nodes: ["n9", "n3"] },
  ],
};

describe("DC operating point", () => {
  it("settles a three-junction direct-coupled feedback loop with the default iteration budget", () => {
    const netlist = kitToPreset(octaviaGain).build({});
    const topology = buildTopology(netlist);
    const { solution, converged } = solveNewton(netlist, topology, new Map(), 0);
    expect(converged).toBe(true);
    const vc = voltageAt(topology, solution, "out");
    expect(vc).toBeGreaterThan(2);
    expect(vc).toBeLessThan(8);
  });
});
