/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StripboardPanel } from "../../../src/editor/pcb/StripboardPanel";
import { loadPedalPreset } from "../../../src/editor/templateLoading";
import { netlistFromGraph } from "../../../src/editor/netlistFromGraph";
import { presets } from "../../../src/core/library/presets";
import { stripboardBuildNotes, stripboardSheetSvg } from "../../../src/editor/pcb/stripboardDrawing";
import { generateStripboard } from "../../../src/editor/pcb/stripboard";
import { buildBoardNetlist } from "../../../src/editor/pcb/boardNetlist";

afterEach(cleanup);

const ts9 = presets.find((p) => p.id === "ts9-overdrive")!;

function renderTs9() {
  const { snapshot, outputNode } = loadPedalPreset(ts9);
  const graph = netlistFromGraph(snapshot.parts, snapshot.wires);
  render(<StripboardPanel parts={snapshot.parts} graph={graph} outputNode={outputNode} />);
}

describe("StripboardPanel", () => {
  it("generates a layout that checks out against the circuit", async () => {
    renderTs9();
    await userEvent.click(screen.getByRole("button", { name: "스트립보드 생성" }));
    expect(screen.getByRole("status")).toHaveTextContent("역검증 통과");
    expect(screen.getByRole("img", { name: "스트립보드 부품면" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "동박면" }));
    expect(screen.getByRole("img", { name: "스트립보드 동박면" })).toBeInTheDocument();
  });

  it("re-checks at once when a cut is removed by hand", async () => {
    renderTs9();
    await userEvent.click(screen.getByRole("button", { name: "스트립보드 생성" }));
    // A cut is drawn as a red ring; its hole's click target sits in the same group.
    const ring = document.querySelector('circle[stroke="#d1495b"]')!;
    fireEvent.click(ring.parentElement!.querySelector("[data-hole]")!);
    expect(screen.getByRole("status")).toHaveTextContent("회로와 다릅니다");
  });
});

describe("stripboard exports", () => {
  const { snapshot, outputNode } = loadPedalPreset(ts9);
  const graph = netlistFromGraph(snapshot.parts, snapshot.wires);
  const board = buildBoardNetlist(snapshot.parts, graph, outputNode);
  const layout = generateStripboard(board, new Map(snapshot.parts.map((p) => [p.id, p.x])));

  it("prints at true size: 2.54mm per hole", () => {
    const svg = stripboardSheetSvg(layout);
    const width = Number(svg.match(/width="([\d.]+)mm"/)![1]);
    expect(width).toBeCloseTo((layout.cols + 2) * 2.54, 6);
    expect(svg).toContain("부품면");
    expect(svg).toContain("동박면");
  });

  it("lists every cut, jumper and part for the build", () => {
    const notes = stripboardBuildNotes(layout);
    expect(notes).toContain(`컷 ${layout.cuts.length}개`);
    expect(notes).toContain(`점퍼 ${layout.jumpers.length}개`);
    for (const p of layout.placements) expect(notes).toContain(`${p.ref} ${p.value}:`);
  });
});
