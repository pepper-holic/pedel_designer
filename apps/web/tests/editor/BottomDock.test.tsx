/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BottomDock } from "../../src/editor/BottomDock";
import { useDock } from "../../src/editor/dockContext";

beforeEach(() => localStorage.clear());
afterEach(cleanup);

function AskForRoom() {
  const dock = useDock();
  return (
    <button type="button" onClick={dock.expand}>
      보드 생성
    </button>
  );
}

const tabs = [
  { key: "a", label: "A", content: <p>첫 탭</p> },
  { key: "b", label: "B", content: <AskForRoom /> },
];

const dockHeight = () => parseInt((document.querySelector(".bottom-dock") as HTMLElement).style.height, 10);

describe("BottomDock", () => {
  it("resizes from its top edge with the keyboard and remembers the height", () => {
    render(<BottomDock tabs={tabs} />);
    const before = dockHeight();
    const handle = screen.getByRole("separator", { name: "분석 패널 높이 조절" });
    fireEvent.keyDown(handle, { key: "ArrowUp" });
    expect(dockHeight()).toBe(before + 40);
    expect(localStorage.getItem("pedal-designer:dock-height")).toBe(String(before + 40));
    cleanup();
    render(<BottomDock tabs={tabs} />);
    expect(dockHeight()).toBe(before + 40);
  });

  it("never shrinks below a usable height", () => {
    render(<BottomDock tabs={tabs} />);
    const handle = screen.getByRole("separator", { name: "분석 패널 높이 조절" });
    for (let i = 0; i < 20; i++) fireEvent.keyDown(handle, { key: "ArrowDown" });
    expect(dockHeight()).toBe(200);
  });

  it("expands on request - from its own button or from the content inside", async () => {
    render(<BottomDock tabs={tabs} />);
    const normal = dockHeight();
    await userEvent.click(screen.getByRole("button", { name: "크게 보기" }));
    expect(dockHeight()).toBeGreaterThan(normal);
    await userEvent.click(screen.getByRole("button", { name: "원래 크기" }));
    expect(dockHeight()).toBe(normal);
    await userEvent.click(screen.getByRole("tab", { name: "B" }));
    await userEvent.click(screen.getByRole("button", { name: "보드 생성" }));
    expect(screen.getByRole("button", { name: "원래 크기" })).toBeInTheDocument();
  });
});
