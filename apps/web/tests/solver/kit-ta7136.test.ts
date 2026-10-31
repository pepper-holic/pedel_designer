import { describe, expect, it } from "vitest";
import { kitToPreset } from "../../src/core/library/kits/kitToPreset";
import { opAmpModel } from "../../src/core/library/kits/partModels";
import type { KitCircuit } from "../../src/core/library/kits/types";
import { runAcAnalysis } from "../../src/core/solver/ac";

describe("TA7136AP (early Boss DS-1 preamp IC)", () => {
  it("is a single op-amp with the 7-pin SIP pinout: + in on pin 2, - in on pin 3", () => {
    const found = opAmpModel("TA7136AP")!;
    expect(found.channels).toBe(1);
    expect(found.pinout.channels).toEqual([{ out: "6", inMinus: "3", inPlus: "2" }]);
    expect(found.pinout.vPlus).toBe("7");
    expect(found.pinout.vMinus).toBe("4");
  });

  it("runs as a non-inverting gain stage wired by package pin", () => {
    // Gain 1 + 10K/1K = 11 (20.8dB): pin 2 takes the signal, pin 3 the feedback divider, pin 6 drives out.
    // Split +-9V rails so the ground-referenced input sits mid-swing.
    const kit: KitCircuit = {
      id: "ta-rig",
      goodsNo: "0",
      kitName: "rig",
      motif: "rig",
      type: "distortion",
      description: "",
      supply: 9,
      rails: [{ net: "vm9", voltage: -9 }],
      parts: [
        { ref: "U1", kind: "IC", part: "TA7136AP", nodes: { "2": "in", "3": "n1", "4": "vm9", "6": "out", "7": "vcc" } },
        { ref: "R1", kind: "R", value: "10K", nodes: ["out", "n1"] },
        { ref: "R2", kind: "R", value: "1K", nodes: ["n1", "0"] },
      ],
    };
    const netlist = kitToPreset(kit).build({});
    const u1 = netlist.elements.find((e) => e.id === "U1")!;
    expect(u1.nodes).toEqual(["in", "n1", "out"]);
    const [point] = runAcAnalysis(netlist, { inputSourceId: "V1", outputNode: "out", frequenciesHz: [1000] });
    // The GBW-limited op-amp model has finite loop gain, so it lands a little under the ideal 20.8dB.
    expect(point.magnitudeDb).toBeGreaterThan(19);
    expect(point.magnitudeDb).toBeLessThan(20 * Math.log10(11) + 0.1);
  });
});
