import { describe, expect, it } from "vitest";
import { runDrc } from "../../src/editor/drc";
import { wiringPresets } from "../../src/editor/wiring";
import { presets } from "../../src/core/library/presets";
import { graphFromNetlist } from "../../src/editor/graphFromNetlist";
import type { PartInstance, Wire } from "../../src/editor/types";

const codesOf = (parts: PartInstance[], wires: Wire[], outputNode = "n1") => runDrc(parts, wires, outputNode).map((i) => i.code);

describe("runDrc", () => {
  it("reports a circuit with no ground and no signal source", () => {
    const parts: PartInstance[] = [{ id: "R1", type: "resistor", x: 0, y: 0, rotation: 0, params: { resistance: 1000 } }];
    const codes = codesOf(parts, []);
    expect(codes).toContain("no-ground");
    expect(codes).toContain("no-signal-source");
  });

  it("flags a two-terminal part with a dangling leg as an error, since it carries no current", () => {
    const parts: PartInstance[] = [
      { id: "V1", type: "vsource", x: 0, y: 0, rotation: 0, params: { voltage: 0 } },
      { id: "R1", type: "resistor", x: 100, y: 0, rotation: 0, params: { resistance: 1000 } },
      { id: "G1", type: "ground", x: 0, y: 100, rotation: 0, params: {} },
    ];
    const wires: Wire[] = [
      { id: "w1", a: { partId: "V1", terminalId: "positive" }, b: { partId: "R1", terminalId: "a" } },
      { id: "w2", a: { partId: "V1", terminalId: "negative" }, b: { partId: "G1", terminalId: "gnd" } },
    ];
    const dangling = runDrc(parts, wires, "n1").find((i) => i.code === "dangling-lead");
    expect(dangling?.severity).toBe("error");
    expect(dangling?.partIds).toEqual(["R1"]);
  });

  it("treats an unused pot or switch lug as a warning, not an error", () => {
    // A tone pot's third lug and a push-pull's unused throw are left open on purpose in real wiring.
    const parts: PartInstance[] = [
      { id: "V1", type: "vsource", x: 0, y: 0, rotation: 0, params: { voltage: 0 } },
      { id: "P1", type: "potentiometer", x: 100, y: 0, rotation: 0, params: { resistance: 1000, position: 0.5, taper: "B" } },
      { id: "G1", type: "ground", x: 0, y: 100, rotation: 0, params: {} },
    ];
    const wires: Wire[] = [
      { id: "w1", a: { partId: "V1", terminalId: "positive" }, b: { partId: "P1", terminalId: "a" } },
      { id: "w2", a: { partId: "P1", terminalId: "wiper" }, b: { partId: "G1", terminalId: "gnd" } },
      { id: "w3", a: { partId: "V1", terminalId: "negative" }, b: { partId: "G1", terminalId: "gnd" } },
    ];
    const issue = runDrc(parts, wires, "n1").find((i) => i.code === "open-lug");
    expect(issue?.severity).toBe("warning");
    expect(issue?.partIds).toEqual(["P1"]);
    expect(codesOf(parts, wires)).not.toContain("dangling-lead");
  });

  it("catches a voltage source shorted across itself", () => {
    const parts: PartInstance[] = [
      { id: "V1", type: "vsource", x: 0, y: 0, rotation: 0, params: { voltage: 0 } },
      { id: "G1", type: "ground", x: 0, y: 100, rotation: 0, params: {} },
    ];
    const wires: Wire[] = [
      { id: "w1", a: { partId: "V1", terminalId: "positive" }, b: { partId: "G1", terminalId: "gnd" } },
      { id: "w2", a: { partId: "V1", terminalId: "negative" }, b: { partId: "G1", terminalId: "gnd" } },
    ];
    expect(codesOf(parts, wires)).toContain("shorted-source");
  });

  it("reports a part with no wires at all separately from a single dangling leg", () => {
    const parts: PartInstance[] = [
      { id: "V1", type: "vsource", x: 0, y: 0, rotation: 0, params: { voltage: 0 } },
      { id: "G1", type: "ground", x: 0, y: 100, rotation: 0, params: {} },
      { id: "C9", type: "capacitor", x: 300, y: 300, rotation: 0, params: { capacitance: 1e-6 } },
    ];
    const wires: Wire[] = [
      { id: "w1", a: { partId: "V1", terminalId: "positive" }, b: { partId: "G1", terminalId: "gnd" } },
    ];
    const issue = runDrc(parts, wires, "n1").find((i) => i.code === "isolated-part");
    expect(issue?.partIds).toEqual(["C9"]);
    // The isolated part shouldn't also be listed as a dangling lead - one message per problem.
    expect(runDrc(parts, wires, "n1").find((i) => i.code === "dangling-lead")).toBeUndefined();
  });

  it("asks for an output node only as a warning", () => {
    const parts: PartInstance[] = [{ id: "G1", type: "ground", x: 0, y: 0, rotation: 0, params: {} }];
    const issue = runDrc(parts, [], "").find((i) => i.code === "no-output-node");
    expect(issue?.severity).toBe("warning");
  });

  it("passes every shipped wiring preset with no errors", () => {
    for (const preset of wiringPresets) {
      const graph = { parts: preset.snapshot.parts, wires: preset.snapshot.wires };
      const outputKey = `${preset.outputTerminal.partId}:${preset.outputTerminal.terminalId}`;
      const issues = runDrc(graph.parts, graph.wires, outputKey);
      const errors = issues.filter((i) => i.severity === "error");
      expect(errors, `${preset.name}: ${errors.map((e) => e.message).join(", ")}`).toHaveLength(0);
    }
  });

  it("passes every shipped pedal preset with no errors", () => {
    for (const preset of presets) {
      const { parts, wires } = graphFromNetlist(preset.build(preset.defaultParams), preset.inputSourceId, preset.layout);
      const errors = runDrc(parts, wires, "n1").filter((i) => i.severity === "error");
      expect(errors, `${preset.name}: ${errors.map((e) => e.message).join(", ")}`).toHaveLength(0);
    }
  });
});
