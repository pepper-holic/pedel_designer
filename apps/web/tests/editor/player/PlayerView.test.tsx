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

/** The app bar's work-step buttons. */
const step = (name: "설계" | "연주" | "분석" | "제작") =>
  within(screen.getByRole("navigation", { name: "작업 단계" })).getByRole("button", { name: new RegExp(name) });

describe("player view", () => {
  it("shows a loaded preset's knobs, and turning one changes the circuit", async () => {
    render(<SchematicEditor />);
    await userEvent.click(screen.getAllByRole("button", { name: /TS9 스타일 오버드라이브/ })[0]);
    await userEvent.click(step("연주"));

    expect(screen.queryByText("회로도", { selector: ".panel-title" })).not.toBeInTheDocument();
    const drive = screen.getByRole("slider", { name: "DRIVE 노브" });
    const before = Number(drive.getAttribute("aria-valuenow"));
    fireEvent.keyDown(drive, { key: "PageUp" });
    expect(Number(screen.getByRole("slider", { name: "DRIVE 노브" }).getAttribute("aria-valuenow"))).toBe(Math.min(100, before + 10));

    await userEvent.click(step("설계"));
    expect(screen.getByText("회로도", { selector: ".panel-title" })).toBeInTheDocument();
  });

  it("points back to design when there is no circuit yet", async () => {
    render(<SchematicEditor />);
    await userEvent.click(step("연주"));
    expect(screen.getByText(/아직 연주할 회로가 없습니다/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /설계로 가기/ }));
    expect(screen.getByRole("region", { name: "시작하기" })).toBeInTheDocument();
  });

  it("explains what to do when the circuit has no controls", async () => {
    render(<SchematicEditor />);
    await userEvent.click(screen.getByRole("tab", { name: "부품" }));
    await userEvent.click(screen.getByRole("button", { name: "저항" }));
    await userEvent.click(step("연주"));
    expect(screen.getByText(/노출된 노브나 스위치가 없습니다/)).toBeInTheDocument();
    // No AudioWorklet in jsdom: the footswitch says so instead of failing silently.
    expect(screen.getByRole("button", { name: "실시간 재생 (풋스위치)" })).toBeDisabled();
  });

  it("does not let canvas shortcuts act on a selection nobody can see", async () => {
    render(<SchematicEditor />);
    await userEvent.click(screen.getByRole("tab", { name: "부품" }));
    await userEvent.click(screen.getByRole("button", { name: "저항" }));
    const canvasPanel = () => screen.getByText("회로도", { selector: ".panel-title" }).closest<HTMLElement>(".panel")!;
    const idLabel = within(canvasPanel()).getByText(/^resistor\d+$/);
    await userEvent.click(idLabel.closest("g")!.querySelector<SVGRectElement>("rect")!);

    await userEvent.click(step("연주"));
    fireEvent.keyDown(window, { key: "Delete" });
    await userEvent.click(step("설계"));
    expect(within(canvasPanel()).getByText(/^resistor\d+$/)).toBeInTheDocument();
  });
});

describe("work steps", () => {
  it("switch with the number keys, and ? opens the shortcut help", async () => {
    const user = userEvent.setup();
    render(<SchematicEditor />);
    await user.click(screen.getAllByRole("button", { name: /TS9 스타일 오버드라이브/ })[0]);

    await user.keyboard("3");
    expect(step("분석")).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: /시뮬레이션 실행/ })).toBeEnabled();
    expect(screen.getByRole("tab", { name: /주파수 응답/ })).toBeInTheDocument();

    await user.keyboard("4");
    expect(screen.getByRole("navigation", { name: "만들기 단계" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /인클로저/ }));
    expect(screen.getByRole("button", { name: /인클로저/ })).toHaveAttribute("aria-current", "step");

    await user.keyboard("?");
    const help = screen.getByRole("dialog", { name: "단축키와 도움말" });
    expect(within(help).getByText("실시간 재생 켜기/끄기")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.keyboard("1");
    expect(screen.getByText("회로도", { selector: ".panel-title" })).toBeInTheDocument();
  });

  it("remembers the step across reloads", async () => {
    const user = userEvent.setup();
    render(<SchematicEditor />);
    await user.click(step("제작"));
    cleanup();
    render(<SchematicEditor />);
    expect(step("제작")).toHaveAttribute("aria-current", "page");
  });

  it("number keys typed into a field stay in the field", async () => {
    const user = userEvent.setup();
    render(<SchematicEditor />);
    await user.type(screen.getByRole("searchbox", { name: /검색/ }), "2");
    expect(step("설계")).toHaveAttribute("aria-current", "page");
  });
});
