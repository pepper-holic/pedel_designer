import { describe, expect, it } from "vitest";
import { buildBom, bomToText } from "../../src/editor/bom";
import type { PartInstance } from "../../src/editor/types";
import { SILICON_DIODE_1N4148, GERMANIUM_DIODE } from "../../src/core/library/deviceModels";

function part(overrides: Partial<PartInstance>): PartInstance {
  return { id: "p1", type: "resistor", x: 0, y: 0, rotation: 0, params: { resistance: 1000 }, ...overrides };
}

describe("buildBom", () => {
  it("groups resistors by value and counts them", () => {
    const parts: PartInstance[] = [
      part({ id: "R1", params: { resistance: 4700 } }),
      part({ id: "R2", params: { resistance: 4700 } }),
      part({ id: "R3", params: { resistance: 10_000 } }),
    ];
    const rows = buildBom(parts);
    const r4k7 = rows.find((r) => r.label.includes("4.7k"))!;
    expect(r4k7.quantity).toBe(2);
    expect(r4k7.partIds.sort()).toEqual(["R1", "R2"]);
    expect(rows.find((r) => r.label.includes("10k"))!.quantity).toBe(1);
  });

  it("distinguishes diode models by their SPICE params instead of merging every diode together", () => {
    const parts: PartInstance[] = [
      part({ id: "D1", type: "diode", params: { ...SILICON_DIODE_1N4148, seriesResistance: 0 } }),
      part({ id: "D2", type: "diode", params: { ...GERMANIUM_DIODE, seriesResistance: 0 } }),
    ];
    const rows = buildBom(parts);
    expect(rows).toHaveLength(2);
    expect(rows.some((r) => r.label.includes("1N4148"))).toBe(true);
    expect(rows.some((r) => r.label.includes("1N34A"))).toBe(true);
  });

  it("excludes voltage sources and ground symbols - not physical parts to buy", () => {
    const parts: PartInstance[] = [
      part({ id: "V1", type: "vsource", params: { voltage: 0 } }),
      part({ id: "GND1", type: "ground", params: {} }),
      part({ id: "R1", type: "resistor", params: { resistance: 1000 } }),
    ];
    const rows = buildBom(parts);
    expect(rows).toHaveLength(1);
    expect(rows[0].partIds).toEqual(["R1"]);
  });

  it("separates NPN and PNP transistors into different rows", () => {
    const parts: PartInstance[] = [
      part({ id: "Q1", type: "bjt", params: { polarity: "npn" } }),
      part({ id: "Q2", type: "bjt", params: { polarity: "pnp" } }),
    ];
    const rows = buildBom(parts);
    expect(rows).toHaveLength(2);
  });
});

describe("bomToText", () => {
  it("renders a tab-separated table with a header row", () => {
    const text = bomToText([{ label: "저항 4.7kΩ", quantity: 2, partIds: ["R1", "R2"] }]);
    const lines = text.split("\n");
    expect(lines[0]).toBe("부품\t수량\t소자 ID");
    expect(lines[1]).toBe("저항 4.7kΩ\t2\tR1, R2");
  });
});
