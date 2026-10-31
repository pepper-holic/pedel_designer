import { describe, expect, it } from "vitest";
import { kitToPreset, UnsupportedKitError } from "../../src/core/library/kits/kitToPreset";
import type { KitCircuit, KitPart } from "../../src/core/library/kits/types";
import { runAcAnalysisMulti } from "../../src/core/solver/ac";

const kitWith = (transformer: KitPart): KitCircuit => ({
  id: "t-rig",
  goodsNo: "0",
  kitName: "rig",
  motif: "rig",
  type: "fuzz",
  description: "",
  supply: 9,
  parts: [transformer, { ref: "R1", kind: "R", value: "100K", nodes: ["n2", "0"] }],
  layout: { T1: { x: 300, y: 400 } },
});

/** 1kHz gain (dB) and phase at each node, the transformer driven from "in". */
function at1k(kit: KitCircuit, nodes: string[]) {
  const preset = kitToPreset(kit);
  const result = runAcAnalysisMulti(preset.build({}), { inputSourceId: "V1", outputNodes: nodes, frequenciesHz: [1000] });
  return Object.fromEntries(nodes.map((n) => [n, result.get(n)![0]]));
}

// 42TM022: 570mH (1.5K side) and 195mH (600R side), so the 600R -> 1.5K step-up is sqrt(570/195) = 1.71.
const STEP_UP_DB = 20 * Math.log10(Math.sqrt(0.57 / 0.195));

describe("kit audio transformer", () => {
  it("steps the 600R winding up to the 1.5K winding at the turns ratio", () => {
    const { out } = at1k(kitWith({ ref: "T1", kind: "T", part: "42TM022", nodes: { p1: "out", p2: "0", s1: "in", s2: "0" } }), ["out"]);
    expect(out.magnitudeDb).toBeCloseTo(STEP_UP_DB, 0);
  });

  it("splits a centre-tapped winding into two antiphase halves of half the voltage each", () => {
    const kit = kitWith({ ref: "T1", kind: "T", part: "42TM022", nodes: { p1: "out", pct: "0", p2: "n2", s1: "in", s2: "0" } });
    const { out, n2 } = at1k(kit, ["out", "n2"]);
    expect(out.magnitudeDb).toBeCloseTo(STEP_UP_DB - 20 * Math.log10(2), 0);
    expect(n2.magnitudeDb).toBeCloseTo(out.magnitudeDb, 1);
    expect(Math.abs(Math.abs(out.phaseDeg - n2.phaseDeg) - 180)).toBeLessThan(5);
  });

  it("places the two halves of a tapped transformer from one AT line", () => {
    const kit = kitWith({ ref: "T1", kind: "T", part: "42TM022", nodes: { p1: "out", pct: "0", p2: "n2", s1: "in", s2: "0" } });
    const layout = kitToPreset(kit).layout!;
    expect(layout.T1A).toEqual({ x: 300, y: 400 });
    expect(layout.T1B?.x).toBe(300);
  });

  it("refuses a transformer it has no model for", () => {
    expect(() => kitToPreset(kitWith({ ref: "T1", kind: "T", part: "XYZ123", nodes: { p1: "out", p2: "0", s1: "in", s2: "0" } }))).toThrow(UnsupportedKitError);
  });
});
