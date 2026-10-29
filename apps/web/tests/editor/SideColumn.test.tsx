/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SideColumn } from "../../src/editor/shell/SideColumn";
import { LibraryCard } from "../../src/editor/library/LibraryCard";
import { presetScene } from "../../src/editor/library/thumbnails";
import { presets } from "../../src/core/library/presets";

afterEach(() => cleanup());

function column(overrides: Partial<React.ComponentProps<typeof SideColumn>> = {}) {
  const props: React.ComponentProps<typeof SideColumn> = {
    title: "라이브러리",
    side: "left",
    width: 300,
    min: 200,
    max: 500,
    collapsed: false,
    onWidthChange: vi.fn(),
    onResetWidth: vi.fn(),
    onCollapsedChange: vi.fn(),
    onSwapSide: vi.fn(),
    header: <span>헤더</span>,
    children: <div>본문</div>,
    ...overrides,
  };
  render(<SideColumn {...props} />);
  return props;
}

describe("SideColumn", () => {
  it("widens toward the schematic with the arrow keys, whichever side it is on", () => {
    const left = column({ side: "left" });
    const handle = screen.getByRole("separator", { name: "라이브러리 너비 조절" });
    fireEvent.keyDown(handle, { key: "ArrowRight" });
    expect(left.onWidthChange).toHaveBeenLastCalledWith(324);
    cleanup();

    const right = column({ side: "right" });
    fireEvent.keyDown(screen.getByRole("separator", { name: "라이브러리 너비 조절" }), { key: "ArrowRight" });
    // Right of the schematic, the same key narrows: it moves the edge away from the centre.
    expect(right.onWidthChange).toHaveBeenLastCalledWith(276);
  });

  it("offers to send itself to the other side and to fold, naming the column", async () => {
    const user = userEvent.setup();
    const props = column();
    await user.click(screen.getByRole("button", { name: "라이브러리 오른쪽으로 보내기" }));
    expect(props.onSwapSide).toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "라이브러리 접기" }));
    expect(props.onCollapsedChange).toHaveBeenCalledWith(true);
  });

  it("folded, keeps only a rail with a reopen control and no resize handle", async () => {
    const user = userEvent.setup();
    const props = column({ collapsed: true });
    expect(screen.queryByRole("separator")).not.toBeInTheDocument();
    expect(screen.queryByText("본문")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "라이브러리 펼치기" }));
    expect(props.onCollapsedChange).toHaveBeenCalledWith(false);
  });
});

describe("LibraryCard", () => {
  it("draws the item's real circuit as its thumbnail and loads on click", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const preset = presets.find((p) => p.id === "ts9-overdrive")!;
    const { container } = render(<LibraryCard label={preset.name} scene={() => presetScene(preset)} verb="불러오기" onClick={onClick} badge="아카이브" />);
    // One wire per routed wire, one symbol group per part.
    expect(container.querySelectorAll("svg.schematic-thumb polyline").length).toBeGreaterThan(3);
    expect(container.querySelectorAll("svg.schematic-thumb > g").length).toBe(presetScene(preset).parts.length);
    await user.click(screen.getByRole("button", { name: /TS9 스타일 오버드라이브/ }));
    expect(onClick).toHaveBeenCalled();
  });
});
