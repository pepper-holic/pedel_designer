/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SchematicEditor } from "../../src/editor/SchematicEditor";

beforeEach(() => {
  localStorage.clear();
  // jsdom has no real canvas 2D backend; the Bode-plot/waveform components already handle a null
  // context gracefully, but stub it so their draw effects don't spam "not implemented" to stderr.
  HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue(null) as unknown as typeof HTMLCanvasElement.prototype.getContext;
});

afterEach(() => {
  cleanup();
});

describe("SchematicEditor", () => {
  it("renders the empty-circuit hint and a disabled undo/새 회로 on first load", () => {
    render(<SchematicEditor />);
    expect(screen.getByText(/회로가 비어 있습니다/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /실행 취소/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "새 회로" })).toBeDisabled();
  });

  it("adding a part from the palette enables undo and clears the empty-circuit hint", async () => {
    const user = userEvent.setup();
    render(<SchematicEditor />);

    await user.click(screen.getByRole("button", { name: "저항" }));

    expect(screen.queryByText(/회로가 비어 있습니다/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /실행 취소/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: "새 회로" })).toBeEnabled();
  });

  it("undo removes the just-added part and re-disables itself", async () => {
    const user = userEvent.setup();
    render(<SchematicEditor />);

    await user.click(screen.getByRole("button", { name: "저항" }));
    expect(screen.getByRole("button", { name: /실행 취소/ })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: /실행 취소/ }));

    expect(screen.getByText(/회로가 비어 있습니다/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /실행 취소/ })).toBeDisabled();
  });

  it("loading a template populates the canvas and selects an output node", async () => {
    const user = userEvent.setup();
    render(<SchematicEditor />);

    await user.click(screen.getByRole("button", { name: "템플릿/블록" }));
    await user.click(screen.getByRole("button", { name: /다이오드 클리퍼 \(대칭\)/ }));

    expect(screen.getByText(/템플릿 로드됨: 다이오드 클리퍼 \(대칭\)/)).toBeInTheDocument();
    const outputSelect = screen.getByLabelText("출력 노드") as HTMLSelectElement;
    expect(outputSelect.value).not.toBe("");
  });

  it("새 회로 asks for confirmation and does nothing when the user cancels", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<SchematicEditor />);

    await user.click(screen.getByRole("button", { name: "저항" }));
    await user.click(screen.getByRole("button", { name: "새 회로" }));

    expect(confirmSpy).toHaveBeenCalled();
    expect(screen.queryByText(/회로가 비어 있습니다/)).not.toBeInTheDocument(); // part was NOT cleared
    confirmSpy.mockRestore();
  });

  it("새 회로 clears the canvas when the user confirms", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<SchematicEditor />);

    await user.click(screen.getByRole("button", { name: "저항" }));
    await user.click(screen.getByRole("button", { name: "새 회로" }));

    expect(screen.getByText(/회로가 비어 있습니다/)).toBeInTheDocument();
    confirmSpy.mockRestore();
  });

  it("selecting a part shows its inspector fields", async () => {
    const user = userEvent.setup();
    render(<SchematicEditor />);

    await user.click(screen.getByRole("button", { name: "저항" }));
    // partCounter is module-level and keeps incrementing across tests in this file, so the id
    // isn't always "resistor1" - match whichever "resistorN" label the canvas actually rendered.
    const canvasPanel = screen.getByText("회로도").closest(".panel")!;
    const idLabel = within(canvasPanel).getByText(/^resistor\d+$/);
    // The clickable hit target is a sibling <rect> (the mousedown handler), not the <text> label
    // itself - the SVG canvas has no accessible role for its shapes, so this is a deliberate,
    // narrowly-scoped DOM query rather than an accessible one (there is no accessible query for it).
    const hitbox = idLabel.closest("g")!.querySelector("rect")!;
    await user.click(hitbox);

    const inspector = screen.getByText("선택된 소자").closest(".panel")!;
    expect(within(inspector).getByText("저항값")).toBeInTheDocument();
  });

  it("adding a block from the block palette stamps its pre-wired parts onto the canvas", async () => {
    const user = userEvent.setup();
    render(<SchematicEditor />);

    await user.click(screen.getByRole("button", { name: "템플릿/블록" }));
    await user.click(screen.getByRole("button", { name: /기능 블록/ }));
    await user.click(screen.getByRole("button", { name: /버퍼 \(Op-Amp 팔로워\)/ }));

    expect(screen.queryByText(/회로가 비어 있습니다/)).not.toBeInTheDocument();
    const canvasPanel = screen.getByText("회로도").closest(".panel")!;
    // The buffer block's only element is a single op-amp instance, id-prefixed with the block's
    // instance id (blkN_U1) - match loosely since blockCounter is module-level like partCounter.
    expect(within(canvasPanel).getByText(/^blk\d+_U1$/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /실행 취소/ })).toBeEnabled();
  });

  it("selecting a part that belongs to a block shows its block name and a whole-block delete option", async () => {
    const user = userEvent.setup();
    render(<SchematicEditor />);

    await user.click(screen.getByRole("button", { name: "템플릿/블록" }));
    await user.click(screen.getByRole("button", { name: /기능 블록/ }));
    await user.click(screen.getByRole("button", { name: /버퍼 \(Op-Amp 팔로워\)/ }));

    const canvasPanel = screen.getByText("회로도").closest(".panel")!;
    const idLabel = within(canvasPanel).getByText(/^blk\d+_U1$/);
    const hitbox = idLabel.closest("g")!.querySelector("rect")!;
    await user.click(hitbox);

    const inspector = screen.getByText("선택된 소자").closest(".panel")!;
    expect(within(inspector).getByText(/소속 블록: 버퍼 \(Op-Amp 팔로워\)/)).toBeInTheDocument();

    await user.click(within(inspector).getByRole("button", { name: "블록 전체 삭제" }));
    expect(screen.getByText(/회로가 비어 있습니다/)).toBeInTheDocument();
  });

  it("clicking a wire selects it and the inspector offers to delete it", async () => {
    const user = userEvent.setup();
    render(<SchematicEditor />);

    await user.click(screen.getByRole("button", { name: "템플릿/블록" }));
    await user.click(screen.getByRole("button", { name: /다이오드 클리퍼 \(대칭\)/ }));

    const canvasPanel = screen.getByText("회로도").closest(".panel")!;
    // Wires are SVG paths with no accessible role, so this is the same kind of deliberate,
    // narrowly-scoped DOM query the part-selection tests above use for the part hit-boxes.
    const wireHitboxes = canvasPanel.querySelectorAll<SVGPathElement>("path[data-wire-id]");
    expect(wireHitboxes.length).toBeGreaterThan(0);

    await user.click(wireHitboxes[0]);

    const inspector = screen.getByText("선택된 배선").closest(".panel")!;
    expect(within(inspector).getByRole("button", { name: "삭제 (Del)" })).toBeInTheDocument();
  });

  it("deleting a selected wire removes only that wire, leaving the parts in place", async () => {
    const user = userEvent.setup();
    render(<SchematicEditor />);

    await user.click(screen.getByRole("button", { name: "템플릿/블록" }));
    await user.click(screen.getByRole("button", { name: /다이오드 클리퍼 \(대칭\)/ }));

    const canvasPanel = screen.getByText("회로도").closest(".panel")!;
    const wireCount = () => canvasPanel.querySelectorAll("path[data-wire-id]").length;
    const partCount = () => canvasPanel.querySelectorAll("g[data-part-id]").length;
    const wiresBefore = wireCount();
    const partsBefore = partCount();

    await user.click(canvasPanel.querySelectorAll<SVGPathElement>("path[data-wire-id]")[0]);
    await user.click(within(screen.getByText("선택된 배선").closest(".panel")!).getByRole("button", { name: "삭제 (Del)" }));

    expect(wireCount()).toBe(wiresBefore - 1);
    expect(partCount()).toBe(partsBefore);
  });

  it("undo restores a deleted wire", async () => {
    const user = userEvent.setup();
    render(<SchematicEditor />);

    await user.click(screen.getByRole("button", { name: "템플릿/블록" }));
    await user.click(screen.getByRole("button", { name: /다이오드 클리퍼 \(대칭\)/ }));

    const canvasPanel = screen.getByText("회로도").closest(".panel")!;
    const wireCount = () => canvasPanel.querySelectorAll("path[data-wire-id]").length;
    const wiresBefore = wireCount();

    await user.click(canvasPanel.querySelectorAll<SVGPathElement>("path[data-wire-id]")[0]);
    await user.click(within(screen.getByText("선택된 배선").closest(".panel")!).getByRole("button", { name: "삭제 (Del)" }));
    expect(wireCount()).toBe(wiresBefore - 1);

    await user.click(screen.getByRole("button", { name: /실행 취소/ }));

    expect(wireCount()).toBe(wiresBefore);
  });
});
