/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PcbLayoutPanel } from "../../../src/editor/pcb/PcbLayoutPanel";
import { loadPedalPreset } from "../../../src/editor/templateLoading";
import { netlistFromGraph } from "../../../src/editor/netlistFromGraph";
import { presets } from "../../../src/core/library/presets";

afterEach(cleanup);

function renderPreset(id: string) {
  const { snapshot, outputNode } = loadPedalPreset(presets.find((p) => p.id === id)!);
  const graph = netlistFromGraph(snapshot.parts, snapshot.wires);
  render(<PcbLayoutPanel parts={snapshot.parts} graph={graph} outputNode={outputNode} />);
}

describe("PcbLayoutPanel", () => {
  it("places and routes a board, reports DRC, and switches views", async () => {
    renderPreset("lpb1-style-boost");
    await userEvent.click(screen.getByRole("button", { name: "PCB 생성" }));
    expect(await screen.findByText(/DRC 통과/)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "PCB 위에서 보기" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "아랫면 동박 (전사용, 미러)" }));
    expect(screen.getByRole("img", { name: "PCB 아랫면 동박 (전사용, 미러)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: ".kicad_pcb 다운로드" })).toBeInTheDocument();
    // Single-sided: no top-copper transfer view to offer.
    expect(screen.queryByRole("button", { name: "윗면 동박 (전사용)" })).not.toBeInTheDocument();
  });

  it("offers the top copper once the board is double-sided", async () => {
    renderPreset("lpb1-style-boost");
    await userEvent.click(screen.getByRole("button", { name: "양면" }));
    await userEvent.click(screen.getByRole("button", { name: "PCB 생성" }));
    expect(await screen.findByText(/DRC 통과/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "윗면 동박 (전사용)" })).toBeInTheDocument();
  });
});
