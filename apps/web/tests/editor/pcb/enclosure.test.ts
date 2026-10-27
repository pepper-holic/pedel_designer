import { describe, expect, it } from "vitest";
import { boardFit, checkHoles, defaultDrillPlan, ENCLOSURES, HOLE_SIZES, smallestFit, type PanelControl } from "../../../src/editor/pcb/enclosure";
import { enclosureSvg, sheetDeltaToFace, sheetSize, toSheet } from "../../../src/editor/pcb/enclosureDrawing";

const box = (id: string) => ENCLOSURES.find((e) => e.id === id)!;
const knobs = (n: number): PanelControl[] => Array.from({ length: n }, (_, i) => ({ label: `K${i + 1}`, kind: "knob" }));

describe("defaultDrillPlan", () => {
  it("drills the knobs, footswitch, LED, both jacks and DC, each on its face", () => {
    const holes = defaultDrillPlan(box("1590B"), [...knobs(3), { label: "MODE", kind: "switch" }]);
    expect(holes.filter((h) => h.kind === "pot")).toHaveLength(3);
    expect(holes.find((h) => h.kind === "switch")!.label).toBe("MODE");
    expect(holes.find((h) => h.id === "in")!.face).toBe("right");
    expect(holes.find((h) => h.id === "out")!.face).toBe("left");
    expect(holes.find((h) => h.kind === "dc")!.face).toBe("end");
    expect(holes.find((h) => h.kind === "footswitch")!.diameter).toBe(HOLE_SIZES.footswitch);
  });

  it.each([
    ["1590B", 1],
    ["1590B", 2],
    ["1590B", 3],
    ["1590B", 4],
    ["125B", 4],
    ["1590BB", 6],
    ["1590A", 1],
  ] as const)("lays out %s with %i knobs without collisions", (id, n) => {
    expect(checkHoles(box(id), defaultDrillPlan(box(id), knobs(n)))).toEqual([]);
  });

  it("warns when a small box is asked for too many knobs", () => {
    expect(checkHoles(box("1590A"), defaultDrillPlan(box("1590A"), knobs(3))).length).toBeGreaterThan(0);
  });
});

describe("checkHoles", () => {
  it("flags holes on the wall, overlapping holes and knobs too close to turn", () => {
    const e = box("1590B");
    const base = { face: "top" as const, diameter: 7.5, kind: "pot" as const };
    const issues = checkHoles(e, [
      { ...base, id: "a", label: "A", x: 2, y: 30 },
      { ...base, id: "b", label: "B", x: 30, y: 30 },
      { ...base, id: "c", label: "C", x: 36, y: 30 },
      { ...base, id: "d", label: "D", x: 30, y: 60 },
      { ...base, id: "e", label: "E", x: 30, y: 78 },
    ]);
    expect(issues.some((i) => i.holeId === "a" && i.message.includes("가장자리"))).toBe(true);
    expect(issues.some((i) => i.holeId === "c" && i.message.includes("너무 가깝"))).toBe(true);
    expect(issues.some((i) => i.holeId === "e" && i.message.includes("노브가 서로 닿습니다"))).toBe(true);
  });
});

describe("board fit", () => {
  it("fits a board either way round and suggests the smallest box that takes it", () => {
    expect(boardFit(box("1590B"), 50, 90)).toEqual({ fits: true, rotated: false });
    expect(boardFit(box("1590B"), 90, 50)).toEqual({ fits: true, rotated: true });
    expect(boardFit(box("1590B"), 70, 70).fits).toBe(false);
    expect(smallestFit(30, 60)!.id).toBe("1590A");
    expect(smallestFit(58, 100)!.id).toBe("125B");
    expect(smallestFit(80, 100)!.id).toBe("1590BB");
    expect(smallestFit(200, 200)).toBeNull();
  });
});

describe("unfolded sheet", () => {
  it("moves a dragged hole by exactly the drag, on every face", () => {
    const e = box("125B");
    for (const face of ["top", "left", "right", "end"] as const) {
      const before = toSheet(e, face, 20, 10);
      const d = sheetDeltaToFace(face, 3, -2);
      const after = toSheet(e, face, 20 + d.dx, 10 + d.dy);
      expect([after.x - before.x, after.y - before.y]).toEqual([3, -2]);
    }
  });

  it("prints at true size", () => {
    const e = box("1590B");
    const svg = enclosureSvg(e, defaultDrillPlan(e, knobs(2)));
    expect(Number(svg.match(/width="([\d.]+)mm"/)![1])).toBeCloseTo(sheetSize(e).w, 6);
    expect(svg).toContain("풋스위치 Ø12.2");
  });
});
