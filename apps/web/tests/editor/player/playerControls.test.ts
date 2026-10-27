import { describe, expect, it } from "vitest";
import { playerSections } from "../../../src/editor/player/playerControls";
import { loadPedalPreset } from "../../../src/editor/templateLoading";
import { ts9OverdrivePreset } from "../../../src/core/library/presets/ts9-overdrive";
import type { PartInstance } from "../../../src/editor/types";

describe("playerSections", () => {
  it("lays out the knobs a preset exposes, block by block", () => {
    const { snapshot } = loadPedalPreset(ts9OverdrivePreset);
    const sections = playerSections(snapshot.blocks, snapshot.parts);
    const knobs = sections.flatMap((s) => s.controls.map((c) => c.param.label));
    expect(knobs).toEqual(["DRIVE"]);
    expect(sections.every((s) => s.controls.every((c) => c.kind === "knob"))).toBe(true);
    expect(sections.some((s) => s.id === "loose")).toBe(false);
  });

  it("gives a block-less circuit's pots and switches a panel of their own", () => {
    const parts: PartInstance[] = [
      { id: "VR1", type: "potentiometer", x: 0, y: 0, rotation: 0, params: { resistance: 1e5, position: 0.3 } },
      { id: "S1", type: "spdt", x: 0, y: 0, rotation: 0, params: { switchPosition: 0 } },
      { id: "R1", type: "resistor", x: 0, y: 0, rotation: 0, params: { resistance: 1e3 } },
    ];
    const [section] = playerSections([], parts);
    expect(section.label).toBe("기타 컨트롤");
    expect(section.controls.map((c) => [c.part.id, c.kind])).toEqual([
      ["VR1", "knob"],
      ["S1", "switch"],
    ]);
  });

  it("leaves raw exposed values (a resistor's ohms) to the block inspector", () => {
    const parts: PartInstance[] = [{ id: "R1", type: "resistor", x: 0, y: 0, rotation: 0, params: { resistance: 1e3 } }];
    const blocks = [{ id: "b1", defId: null, label: "B", category: "gain" as const, ports: [], params: [{ id: "p", label: "R", partId: "R1", paramKey: "resistance" }], collapsed: false }];
    expect(playerSections(blocks, parts)).toEqual([]);
  });
});
