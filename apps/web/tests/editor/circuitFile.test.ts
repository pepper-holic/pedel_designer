import { describe, expect, it } from "vitest";
import { circuitToFileText, parseCircuitFile } from "../../src/editor/circuitFile";
import { wiringPresets } from "../../src/editor/wiring";

const validCircuit = {
  schemaVersion: 1,
  parts: [
    { id: "R1", type: "resistor", x: 10, y: 20, rotation: 0, params: { resistance: 1000 } },
    { id: "G1", type: "ground", x: 10, y: 90, rotation: 0, params: {} },
  ],
  wires: [{ id: "w1", a: { partId: "R1", terminalId: "a" }, b: { partId: "G1", terminalId: "gnd" } }],
  blocks: [],
  outputNode: "n1",
  inputGain: 0.5,
};

describe("parseCircuitFile", () => {
  it("round-trips a shipped preset through text and back", () => {
    const preset = wiringPresets.find((p) => p.id === "wiring-strat-style-5way")!;
    const text = circuitToFileText({
      schemaVersion: 1,
      parts: preset.snapshot.parts,
      wires: preset.snapshot.wires,
      blocks: [],
      outputNode: "n1",
      inputGain: 0.5,
    });
    const result = parseCircuitFile(text);
    expect(result.error).toBeNull();
    expect(result.circuit?.parts).toHaveLength(preset.snapshot.parts.length);
    expect(result.circuit?.wires).toHaveLength(preset.snapshot.wires.length);
  });

  it("rejects text that is not JSON at all", () => {
    expect(parseCircuitFile("not json").error).toMatch(/읽을 수 없/);
  });

  it("rejects a part whose type this app does not have", () => {
    const bad = { ...validCircuit, parts: [{ ...validCircuit.parts[0], type: "flux-capacitor" }] };
    // Without this check an unknown type crashes the very next render, because every lookup goes
    // through PART_DEFS[part.type].terminals.
    expect(parseCircuitFile(JSON.stringify(bad)).error).toMatch(/알 수 없는 소자/);
  });

  it("rejects a wire pointing at a terminal the part does not have", () => {
    const bad = {
      ...validCircuit,
      wires: [{ id: "w1", a: { partId: "R1", terminalId: "wiper" }, b: { partId: "G1", terminalId: "gnd" } }],
    };
    expect(parseCircuitFile(JSON.stringify(bad)).error).toMatch(/단자/);
  });

  it("rejects a wire pointing at a part that is not in the file", () => {
    const bad = {
      ...validCircuit,
      wires: [{ id: "w1", a: { partId: "NOPE", terminalId: "a" }, b: { partId: "G1", terminalId: "gnd" } }],
    };
    expect(parseCircuitFile(JSON.stringify(bad)).error).toMatch(/없는 부품/);
  });

  it("rejects duplicate part ids, which would make wires ambiguous", () => {
    const bad = { ...validCircuit, parts: [validCircuit.parts[0], { ...validCircuit.parts[0] }] };
    expect(parseCircuitFile(JSON.stringify(bad)).error).toMatch(/중복/);
  });

  it("accepts a valid circuit and normalises a missing blocks field", () => {
    const withoutBlocks = { ...validCircuit } as Record<string, unknown>;
    delete withoutBlocks.blocks;
    const result = parseCircuitFile(JSON.stringify(withoutBlocks));
    expect(result.error).toBeNull();
    expect(result.circuit?.blocks).toEqual([]);
  });
});
