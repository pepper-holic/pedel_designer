/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SideColumn } from "../../src/editor/shell/SideColumn";
import { LibraryRow } from "../../src/editor/library/LibraryRow";
import { presetMotif, PRESET_MOTIFS } from "../../src/core/library/presetMotifs";
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

describe("LibraryRow", () => {
  it("shows the pedal it is styled after with its colour, but is still found by the preset's full name", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const preset = presets.find((p) => p.id === "ts9-overdrive")!;
    const motif = presetMotif(preset.id)!;
    const { container } = render(<LibraryRow name={preset.name} primary={`${motif.name} 스타일`} secondary={preset.category} color={motif.color} verb="불러오기" onClick={onClick} />);
    expect(screen.getByText("TS9 스타일")).toBeInTheDocument();
    expect(screen.getByText("오버드라이브")).toBeInTheDocument();
    expect(container.querySelector<HTMLElement>(".library-chip")!.style.background).not.toBe("");
    await user.click(screen.getByRole("button", { name: preset.name }));
    expect(onClick).toHaveBeenCalled();
  });

  it("gives a generic circuit a blank chip and its own name", () => {
    render(<LibraryRow name="다이오드 클리퍼 (대칭)" primary="다이오드 클리퍼 (대칭)" verb="불러오기" onClick={vi.fn()} />);
    expect(document.querySelector(".library-chip-generic")).not.toBeNull();
    expect(screen.getByRole("button", { name: "다이오드 클리퍼 (대칭)" })).toBeInTheDocument();
  });
});

describe("preset motifs", () => {
  it("every motif names a real preset and carries a colour", () => {
    const ids = new Set(presets.map((p) => p.id));
    for (const [id, motif] of Object.entries(PRESET_MOTIFS)) {
      expect(ids.has(id), id).toBe(true);
      expect(motif.color).toMatch(/^#[0-9a-f]{6}$/i);
      expect(motif.name.length).toBeGreaterThan(0);
    }
  });
});
