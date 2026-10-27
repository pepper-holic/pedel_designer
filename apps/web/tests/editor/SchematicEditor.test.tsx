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
    const canvasPanel = screen.getByText("회로도").closest<HTMLElement>(".panel")!;
    const idLabel = within(canvasPanel).getByText(/^resistor\d+$/);
    // The clickable hit target is a sibling <rect> (the mousedown handler), not the <text> label
    // itself - the SVG canvas has no accessible role for its shapes, so this is a deliberate,
    // narrowly-scoped DOM query rather than an accessible one (there is no accessible query for it).
    const hitbox = idLabel.closest("g")!.querySelector<SVGRectElement>("rect")!;
    await user.click(hitbox);

    const inspector = screen.getByText("선택된 소자").closest<HTMLElement>(".panel")!;
    expect(within(inspector).getByText("저항값")).toBeInTheDocument();
  });

  it("adding a block from the block palette stamps its pre-wired parts onto the canvas", async () => {
    const user = userEvent.setup();
    render(<SchematicEditor />);

    await user.click(screen.getByRole("button", { name: "템플릿/블록" }));
    await user.click(screen.getByRole("button", { name: /기능 블록/ }));
    await user.click(screen.getByRole("button", { name: /버퍼 \(Op-Amp 팔로워\)/ }));

    expect(screen.queryByText(/회로가 비어 있습니다/)).not.toBeInTheDocument();
    const canvasPanel = screen.getByText("회로도").closest<HTMLElement>(".panel")!;
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

    const canvasPanel = screen.getByText("회로도").closest<HTMLElement>(".panel")!;
    const idLabel = within(canvasPanel).getByText(/^blk\d+_U1$/);
    // The body hit-box, not the selection outline (adding a block selects it, so the outline is drawn).
    const hitbox = idLabel.closest("g")!.querySelector<SVGRectElement>('rect[fill="transparent"]')!;
    await user.click(hitbox);

    const inspector = screen.getByText("선택된 소자").closest<HTMLElement>(".panel")!;
    expect(within(inspector).getByText(/소속 블록: 버퍼 \(Op-Amp 팔로워\)/)).toBeInTheDocument();

    await user.click(within(inspector).getByRole("button", { name: "블록 전체 삭제" }));
    expect(screen.getByText(/회로가 비어 있습니다/)).toBeInTheDocument();
  });

  it("clicking a wire selects it and the inspector offers to delete it", async () => {
    const user = userEvent.setup();
    render(<SchematicEditor />);

    await user.click(screen.getByRole("button", { name: "템플릿/블록" }));
    await user.click(screen.getByRole("button", { name: /다이오드 클리퍼 \(대칭\)/ }));

    const canvasPanel = screen.getByText("회로도").closest<HTMLElement>(".panel")!;
    // Wires are SVG paths with no accessible role, so this is the same kind of deliberate,
    // narrowly-scoped DOM query the part-selection tests above use for the part hit-boxes.
    const wireHitboxes = canvasPanel.querySelectorAll<SVGPathElement>("path[data-wire-id]");
    expect(wireHitboxes.length).toBeGreaterThan(0);

    await user.click(wireHitboxes[0]);

    const inspector = screen.getByText("선택된 배선").closest<HTMLElement>(".panel")!;
    expect(within(inspector).getByRole("button", { name: "삭제 (Del)" })).toBeInTheDocument();
  });

  it("deleting a selected wire removes only that wire, leaving the parts in place", async () => {
    const user = userEvent.setup();
    render(<SchematicEditor />);

    await user.click(screen.getByRole("button", { name: "템플릿/블록" }));
    await user.click(screen.getByRole("button", { name: /다이오드 클리퍼 \(대칭\)/ }));

    const canvasPanel = screen.getByText("회로도").closest<HTMLElement>(".panel")!;
    const wireCount = () => canvasPanel.querySelectorAll("path[data-wire-id]").length;
    const partCount = () => canvasPanel.querySelectorAll("g[data-part-id]").length;
    const wiresBefore = wireCount();
    const partsBefore = partCount();

    await user.click(canvasPanel.querySelectorAll<SVGPathElement>("path[data-wire-id]")[0]);
    await user.click(within(screen.getByText("선택된 배선").closest<HTMLElement>(".panel")!).getByRole("button", { name: "삭제 (Del)" }));

    expect(wireCount()).toBe(wiresBefore - 1);
    expect(partCount()).toBe(partsBefore);
  });

  it("undo restores a deleted wire", async () => {
    const user = userEvent.setup();
    render(<SchematicEditor />);

    await user.click(screen.getByRole("button", { name: "템플릿/블록" }));
    await user.click(screen.getByRole("button", { name: /다이오드 클리퍼 \(대칭\)/ }));

    const canvasPanel = screen.getByText("회로도").closest<HTMLElement>(".panel")!;
    const wireCount = () => canvasPanel.querySelectorAll("path[data-wire-id]").length;
    const wiresBefore = wireCount();

    await user.click(canvasPanel.querySelectorAll<SVGPathElement>("path[data-wire-id]")[0]);
    await user.click(within(screen.getByText("선택된 배선").closest<HTMLElement>(".panel")!).getByRole("button", { name: "삭제 (Del)" }));
    expect(wireCount()).toBe(wiresBefore - 1);

    await user.click(screen.getByRole("button", { name: /실행 취소/ }));

    expect(wireCount()).toBe(wiresBefore);
  });

  it("drops a half-finished wire when the circuit is replaced instead of connecting it to a deleted part", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<SchematicEditor />);

    const canvasPanel = screen.getByText("회로도").closest<HTMLElement>(".panel")!;
    const terminalsOf = (partId: string) =>
      Array.from(canvasPanel.querySelector(`g[data-part-id="${partId}"]`)!.querySelectorAll<SVGCircleElement>("circle")).filter(
        (c) => c.getAttribute("r") === "4",
      );
    const idsOnCanvas = () =>
      Array.from(canvasPanel.querySelectorAll("g[data-part-id]")).map((g) => g.getAttribute("data-part-id")!);

    // Start one wire, then throw the whole circuit away before finishing it.
    await user.click(screen.getByRole("button", { name: "저항" }));
    await user.click(terminalsOf(idsOnCanvas()[0])[0]);
    await user.click(screen.getByRole("button", { name: "새 회로" }));

    // Two fresh parts, wired to each other. The stale pending terminal must not have eaten the
    // first of these two clicks to make an invisible wire to the part that no longer exists.
    await user.click(screen.getByRole("button", { name: "저항" }));
    await user.click(screen.getByRole("button", { name: "커패시터" }));
    const [first, second] = idsOnCanvas();
    await user.click(terminalsOf(first)[1]);
    await user.click(terminalsOf(second)[0]);

    expect(canvasPanel.querySelectorAll("path[data-wire-id]")).toHaveLength(1);
    confirmSpy.mockRestore();
  });

  it("loads the chosen topology variant of a preset, not only its default branch", async () => {
    const user = userEvent.setup();
    render(<SchematicEditor />);

    await user.click(screen.getByRole("button", { name: "템플릿/블록" }));
    await user.click(screen.getByRole("button", { name: /듀얼 보이싱 오버드라이브/ }));

    const canvasPanel = screen.getByText("회로도").closest<HTMLElement>(".panel")!;
    // Default (clipMode 0) clips inside the feedback loop through four series diodes.
    expect(within(canvasPanel).getByText("D1a")).toBeInTheDocument();
    expect(within(canvasPanel).queryByText("Rs")).not.toBeInTheDocument();

    // clipMode 1 swaps in the output-shunt topology: a current-limiting Rs and a plain diode pair.
    // Matched by exact name on purpose - a loose regex here silently matches the unrelated
    // "RAT 스타일 디스토션 (출력단 션트 클리핑)" preset, which also has an Rs and no D1a.
    await user.click(screen.getByRole("button", { name: "출력단 션트 클리핑 (단단함)" }));

    expect(within(canvasPanel).getByText("Rs")).toBeInTheDocument();
    expect(within(canvasPanel).queryByText("D1a")).not.toBeInTheDocument();
  });
});

describe("SchematicEditor keyboard navigation", () => {
  const transformOf = (canvasPanel: HTMLElement, id: string) =>
    canvasPanel.querySelector(`g[data-part-id="${id}"]`)!.getAttribute("transform")!;

  const idsOnCanvas = (canvasPanel: HTMLElement) =>
    Array.from(canvasPanel.querySelectorAll("g[data-part-id]")).map((g) => g.getAttribute("data-part-id")!);

  it("moves the selected part with the arrow keys", async () => {
    const user = userEvent.setup();
    render(<SchematicEditor />);

    await user.click(screen.getByRole("button", { name: /^저항$/ }));
    const canvasPanel = screen.getByText("회로도").closest<HTMLElement>(".panel")!;
    const [id] = idsOnCanvas(canvasPanel);

    // Nothing selected yet: the first arrow press should pick a part rather than doing nothing.
    await user.keyboard("{ArrowRight}");
    const afterFirst = transformOf(canvasPanel, id);

    await user.keyboard("{ArrowRight}");
    expect(transformOf(canvasPanel, id)).not.toBe(afterFirst);
  });

  it("takes a bigger step when shift is held", async () => {
    const user = userEvent.setup();
    render(<SchematicEditor />);

    await user.click(screen.getByRole("button", { name: "커패시터" }));
    const canvasPanel = screen.getByText("회로도").closest<HTMLElement>(".panel")!;
    const [id] = idsOnCanvas(canvasPanel);
    const xOf = () => Number(transformOf(canvasPanel, id).match(/translate\((-?\d+)/)![1]);

    await user.keyboard("{ArrowRight}"); // selects
    const start = xOf();
    await user.keyboard("{ArrowRight}");
    const smallStep = xOf() - start;
    await user.keyboard("{Shift>}{ArrowRight}{/Shift}");
    const bigStep = xOf() - start - smallStep;

    expect(bigStep).toBeGreaterThan(smallStep);
  });

  it("cycles the selection through the parts with the bracket keys", async () => {
    const user = userEvent.setup();
    render(<SchematicEditor />);

    await user.click(screen.getByRole("button", { name: /^저항$/ }));
    await user.click(screen.getByRole("button", { name: "커패시터" }));
    const canvasPanel = screen.getByText("회로도").closest<HTMLElement>(".panel")!;
    const inspector = () => screen.getByText("선택된 소자").closest<HTMLElement>(".panel")!;

    // The inspector's first description line names the selected part, e.g. "저항 (resistor1)".
    const selectedName = () => inspector().querySelector(".preset-description")!.textContent;
    await user.keyboard("]");
    const first = selectedName();
    await user.keyboard("]");
    const second = selectedName();

    expect(second).not.toBe(first);
    expect(idsOnCanvas(canvasPanel).length).toBe(2);
  });

  it("clears the selection on Escape", async () => {
    const user = userEvent.setup();
    render(<SchematicEditor />);

    await user.click(screen.getByRole("button", { name: /^저항$/ }));
    await user.keyboard("]");
    expect(screen.queryByText(/캔버스에서 소자나 배선을 클릭해 선택하세요/)).not.toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.getByText(/캔버스에서 소자나 배선을 클릭해 선택하세요/)).toBeInTheDocument();
  });
});
