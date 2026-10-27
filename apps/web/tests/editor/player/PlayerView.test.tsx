/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Knob } from "../../../src/editor/player/Knob";
import { SchematicEditor } from "../../../src/editor/SchematicEditor";

beforeEach(() => {
  localStorage.clear();
  HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue(null) as unknown as typeof HTMLCanvasElement.prototype.getContext;
});

afterEach(cleanup);

describe("Knob", () => {
  it("steps with the keyboard and jumps to the ends with Home/End", () => {
    const onChange = vi.fn();
    render(<Knob label="DRIVE" value={0.5} onChange={onChange} />);
    const knob = screen.getByRole("slider", { name: "DRIVE 노브" });
    expect(knob).toHaveAttribute("aria-valuenow", "50");
    fireEvent.keyDown(knob, { key: "ArrowUp" });
    expect(onChange).toHaveBeenLastCalledWith(0.52);
    fireEvent.keyDown(knob, { key: "PageDown" });
    expect(onChange).toHaveBeenLastCalledWith(0.4);
    fireEvent.keyDown(knob, { key: "End" });
    expect(onChange).toHaveBeenLastCalledWith(1);
  });

  it("turns up when dragged upwards", () => {
    const onChange = vi.fn();
    render(<Knob label="TONE" value={0.2} onChange={onChange} />);
    const knob = screen.getByRole("slider", { name: "TONE 노브" });
    fireEvent.pointerDown(knob, { clientY: 200, pointerId: 1 });
    fireEvent.pointerMove(knob, { clientY: 120, pointerId: 1 });
    expect(onChange).toHaveBeenLastCalledWith(0.7);
    fireEvent.pointerUp(knob, { pointerId: 1 });
    onChange.mockClear();
    fireEvent.pointerMove(knob, { clientY: 0, pointerId: 1 });
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("player view", () => {
  it("shows a loaded preset's knobs, and turning one changes the circuit", async () => {
    render(<SchematicEditor />);
    await userEvent.click(screen.getByRole("button", { name: "템플릿/블록" }));
    await userEvent.click(screen.getAllByRole("button", { name: /TS9 스타일 오버드라이브/ })[0]);
    await userEvent.click(screen.getByRole("button", { name: "연주" }));

    expect(screen.queryByText("회로도", { selector: ".panel-title" })).not.toBeInTheDocument();
    const drive = screen.getByRole("slider", { name: "DRIVE 노브" });
    const before = Number(drive.getAttribute("aria-valuenow"));
    fireEvent.keyDown(drive, { key: "PageUp" });
    expect(Number(screen.getByRole("slider", { name: "DRIVE 노브" }).getAttribute("aria-valuenow"))).toBe(Math.min(100, before + 10));

    await userEvent.click(screen.getByRole("button", { name: "회로도" }));
    expect(screen.getByText("회로도", { selector: ".panel-title" })).toBeInTheDocument();
  });

  it("explains what to do when the circuit has no controls", async () => {
    render(<SchematicEditor />);
    await userEvent.click(screen.getByRole("button", { name: "연주" }));
    expect(screen.getByText(/노출된 노브나 스위치가 없습니다/)).toBeInTheDocument();
    // No AudioWorklet in jsdom: the footswitch says so instead of failing silently.
    expect(screen.getByRole("button", { name: "실시간 재생 (풋스위치)" })).toBeDisabled();
  });

  it("does not let canvas shortcuts act on a selection nobody can see", async () => {
    render(<SchematicEditor />);
    await userEvent.click(screen.getByRole("button", { name: "저항" }));
    const canvasPanel = () => screen.getByText("회로도", { selector: ".panel-title" }).closest<HTMLElement>(".panel")!;
    const idLabel = within(canvasPanel()).getByText(/^resistor\d+$/);
    await userEvent.click(idLabel.closest("g")!.querySelector<SVGRectElement>("rect")!);

    await userEvent.click(screen.getByRole("button", { name: "연주" }));
    fireEvent.keyDown(window, { key: "Delete" });
    await userEvent.click(screen.getByRole("button", { name: "회로도" }));
    expect(within(canvasPanel()).getByText(/^resistor\d+$/)).toBeInTheDocument();
  });
});
