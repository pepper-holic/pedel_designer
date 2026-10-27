/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SchematicEditor } from "../../../src/editor/SchematicEditor";

beforeEach(() => {
  localStorage.clear();
  HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue(null) as unknown as typeof HTMLCanvasElement.prototype.getContext;
});
afterEach(cleanup);

describe("footprint choice in the inspector", () => {
  it("shows the value-based default and stores an explicit choice, which the BOM picks up", async () => {
    const user = userEvent.setup();
    render(<SchematicEditor />);
    await user.click(screen.getByRole("button", { name: "커패시터" }));
    const canvasPanel = screen.getByText("회로도", { selector: ".panel-title" }).closest<HTMLElement>(".panel")!;
    const label = within(canvasPanel).getByText(/^capacitor\d+$/);
    await user.click(label.closest("g")!.querySelector<SVGRectElement>("rect")!);

    const select = screen.getByLabelText("풋프린트 (PCB)");
    // Default 1µF -> a small electrolytic.
    expect(within(select).getByRole("option", { name: /^기본: 전해 5mm/ })).toBeInTheDocument();
    await user.selectOptions(select, "필름 박스 7.5mm");
    expect(select).toHaveValue("c-film-7.5");

    await user.click(screen.getByRole("tab", { name: /BOM/ }));
    expect(screen.getByRole("cell", { name: "필름 박스 7.5mm" })).toBeInTheDocument();
  });
});
