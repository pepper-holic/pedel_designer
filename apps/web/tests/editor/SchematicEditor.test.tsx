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

type User = ReturnType<typeof userEvent.setup>;

/** The start cards cover the canvas while the circuit is empty. */
const startCards = () => screen.queryByRole("region", { name: "시작하기" });

/** 새 회로 lives in the 파일 menu. */
async function clickNewCircuit(user: User) {
  await user.click(screen.getByRole("button", { name: "파일" }));
  await user.click(screen.getByRole("menuitem", { name: "새 회로" }));
}

const showTab = (user: User, name: "프리셋" | "블록" | "부품") => user.click(screen.getByRole("tab", { name }));

describe("SchematicEditor", () => {
  it("renders the start cards and a disabled undo/새 회로 on first load", async () => {
    const user = userEvent.setup();
    render(<SchematicEditor />);
    expect(startCards()).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /실행 취소/ })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "파일" }));
    expect(screen.getByRole("menuitem", { name: "새 회로" })).toBeDisabled();
  });

  it("the start cards lead to the matching library tab", async () => {
    const user = userEvent.setup();
    render(<SchematicEditor />);
    await user.click(screen.getByRole("button", { name: /부품부터 배치/ }));
    expect(screen.getByRole("tab", { name: "부품" })).toHaveAttribute("aria-selected", "true");
    await user.click(screen.getByRole("button", { name: /블록으로 조립/ }));
    expect(screen.getByRole("tab", { name: "블록" })).toHaveAttribute("aria-selected", "true");
  });

  it("adding a part from the palette enables undo and clears the start cards", async () => {
    const user = userEvent.setup();
    render(<SchematicEditor />);

    await showTab(user, "부품");
    await user.click(screen.getByRole("button", { name: "저항" }));

    expect(startCards()).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /실행 취소/ })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "파일" }));
    expect(screen.getByRole("menuitem", { name: "새 회로" })).toBeEnabled();
  });

  it("undo removes the just-added part and re-disables itself", async () => {
    const user = userEvent.setup();
    render(<SchematicEditor />);

    await showTab(user, "부품");
    await user.click(screen.getByRole("button", { name: "저항" }));
    expect(screen.getByRole("button", { name: /실행 취소/ })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: /실행 취소/ }));

    expect(startCards()).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /실행 취소/ })).toBeDisabled();
  });

  it("loading a template populates the canvas and selects an output node", async () => {
    const user = userEvent.setup();
    render(<SchematicEditor />);

    await user.click(screen.getByRole("button", { name: /다이오드 클리퍼 \(대칭\)/ }));

    expect(screen.getByRole("status")).toHaveTextContent(/불러옴: 다이오드 클리퍼 \(대칭\)/);
    const outputSelect = screen.getByLabelText("듣는 지점") as HTMLSelectElement;
    expect(outputSelect.value).not.toBe("");
    // The app bar names the circuit, and the right column offers the next steps.
    expect(screen.getByRole("banner")).toHaveTextContent("다이오드 클리퍼 (대칭)");
    expect(screen.getByRole("button", { name: /연주하며 들어보기/ })).toBeInTheDocument();
  });

  it("새 회로 asks for confirmation and does nothing when the user cancels", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<SchematicEditor />);

    await showTab(user, "부품");
    await user.click(screen.getByRole("button", { name: "저항" }));
    await clickNewCircuit(user);

    expect(confirmSpy).toHaveBeenCalled();
    expect(startCards()).not.toBeInTheDocument(); // part was NOT cleared
    confirmSpy.mockRestore();
  });

  it("새 회로 clears the canvas when the user confirms", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<SchematicEditor />);

    await showTab(user, "부품");
    await user.click(screen.getByRole("button", { name: "저항" }));
    await clickNewCircuit(user);

    expect(startCards()).toBeInTheDocument();
    confirmSpy.mockRestore();
  });

  it("selecting a part shows its inspector fields", async () => {
    const user = userEvent.setup();
    render(<SchematicEditor />);

    await showTab(user, "부품");
    await user.click(screen.getByRole("button", { name: "저항" }));
    // partCounter is module-level and keeps incrementing across tests in this file, so the id
    // isn't always "resistor1" - match whichever "resistorN" label the canvas actually rendered.
    const canvasPanel = screen.getByText("회로도", { selector: ".panel-title" }).closest<HTMLElement>(".panel")!;
    const idLabel = within(canvasPanel).getByText(/^resistor\d+$/);
    // The id label is drawn by a separate layer (CanvasLabelLayer), not inside the part's own <g> -
    // find the part's group by the id text it shows, then its clickable hit target, a sibling <rect>
    // (the mousedown handler). The SVG canvas has no accessible role for its shapes, so this is a
    // deliberate, narrowly-scoped DOM query rather than an accessible one (there is no accessible
    // query for it).
    const partGroup = canvasPanel.querySelector<SVGGElement>(`g[data-part-id="${idLabel.textContent}"]`)!;
    const hitbox = partGroup.querySelector<SVGRectElement>("rect")!;
    await user.click(hitbox);

    const inspector = screen.getByText("선택된 소자").closest<HTMLElement>(".panel")!;
    expect(within(inspector).getByText("저항값")).toBeInTheDocument();
  });

  it("adding a block from the block palette stamps its pre-wired parts onto the canvas", async () => {
    const user = userEvent.setup();
    render(<SchematicEditor />);

    await showTab(user, "블록");
    await user.click(screen.getByRole("button", { name: /버퍼 \(Op-Amp 팔로워\)/ }));

    expect(startCards()).not.toBeInTheDocument();
    const canvasPanel = screen.getByText("회로도", { selector: ".panel-title" }).closest<HTMLElement>(".panel")!;
    // The buffer block's only element is a single op-amp instance, id-prefixed with the block's
    // instance id (blkN_U1) - match loosely since blockCounter is module-level like partCounter.
    expect(within(canvasPanel).getByText(/^blk\d+_U1$/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /실행 취소/ })).toBeEnabled();
  });

  it("selecting a part that belongs to a block shows its block name and a whole-block delete option", async () => {
    const user = userEvent.setup();
    render(<SchematicEditor />);

    await showTab(user, "블록");
    await user.click(screen.getByRole("button", { name: /버퍼 \(Op-Amp 팔로워\)/ }));

    const canvasPanel = screen.getByText("회로도", { selector: ".panel-title" }).closest<HTMLElement>(".panel")!;
    const idLabel = within(canvasPanel).getByText(/^blk\d+_U1$/);
    // The id label is drawn by a separate layer (CanvasLabelLayer), not inside the part's own <g> -
    // find the part's group by the id text it shows, then the body hit-box, not the selection
    // outline (adding a block selects it, so the outline is drawn).
    const partGroup = canvasPanel.querySelector<SVGGElement>(`g[data-part-id="${idLabel.textContent}"]`)!;
    const hitbox = partGroup.querySelector<SVGRectElement>('rect[fill="transparent"]')!;
    await user.click(hitbox);

    const inspector = screen.getByText("선택된 소자").closest<HTMLElement>(".panel")!;
    expect(within(inspector).getByText(/소속 블록: 버퍼 \(Op-Amp 팔로워\)/)).toBeInTheDocument();

    await user.click(within(inspector).getByRole("button", { name: "블록 전체 삭제" }));
    expect(startCards()).toBeInTheDocument();
  });

  it("clicking a wire selects it and the inspector offers to delete it", async () => {
    const user = userEvent.setup();
    render(<SchematicEditor />);

    await user.click(screen.getByRole("button", { name: /다이오드 클리퍼 \(대칭\)/ }));

    const canvasPanel = screen.getByText("회로도", { selector: ".panel-title" }).closest<HTMLElement>(".panel")!;
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

    await user.click(screen.getByRole("button", { name: /다이오드 클리퍼 \(대칭\)/ }));

    const canvasPanel = screen.getByText("회로도", { selector: ".panel-title" }).closest<HTMLElement>(".panel")!;
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

    await user.click(screen.getByRole("button", { name: /다이오드 클리퍼 \(대칭\)/ }));

    const canvasPanel = screen.getByText("회로도", { selector: ".panel-title" }).closest<HTMLElement>(".panel")!;
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

    const canvasPanel = screen.getByText("회로도", { selector: ".panel-title" }).closest<HTMLElement>(".panel")!;
    const terminalsOf = (partId: string) =>
      Array.from(canvasPanel.querySelector(`g[data-part-id="${partId}"]`)!.querySelectorAll<SVGCircleElement>("circle")).filter(
        (c) => c.getAttribute("r") === "4",
      );
    const idsOnCanvas = () => Array.from(canvasPanel.querySelectorAll("g[data-part-id]")).map((g) => g.getAttribute("data-part-id")!);

    // Start one wire, then throw the whole circuit away before finishing it.
    await showTab(user, "부품");
    await user.click(screen.getByRole("button", { name: "저항" }));
    await user.click(terminalsOf(idsOnCanvas()[0])[0]);
    await clickNewCircuit(user);

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

    await user.click(screen.getByRole("button", { name: /듀얼 보이싱 오버드라이브/ }));

    const canvasPanel = screen.getByText("회로도", { selector: ".panel-title" }).closest<HTMLElement>(".panel")!;
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
  const transformOf = (canvasPanel: HTMLElement, id: string) => canvasPanel.querySelector(`g[data-part-id="${id}"]`)!.getAttribute("transform")!;

  const idsOnCanvas = (canvasPanel: HTMLElement) => Array.from(canvasPanel.querySelectorAll("g[data-part-id]")).map((g) => g.getAttribute("data-part-id")!);

  it("moves the selected part with the arrow keys", async () => {
    const user = userEvent.setup();
    render(<SchematicEditor />);

    await showTab(user, "부품");
    await user.click(screen.getByRole("button", { name: /^저항$/ }));
    const canvasPanel = screen.getByText("회로도", { selector: ".panel-title" }).closest<HTMLElement>(".panel")!;
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

    await showTab(user, "부품");
    await user.click(screen.getByRole("button", { name: "커패시터" }));
    const canvasPanel = screen.getByText("회로도", { selector: ".panel-title" }).closest<HTMLElement>(".panel")!;
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

    await showTab(user, "부품");
    await user.click(screen.getByRole("button", { name: /^저항$/ }));
    await user.click(screen.getByRole("button", { name: "커패시터" }));
    const canvasPanel = screen.getByText("회로도", { selector: ".panel-title" }).closest<HTMLElement>(".panel")!;
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

  it("clears the selection on Escape, bringing back the circuit summary", async () => {
    const user = userEvent.setup();
    render(<SchematicEditor />);

    await showTab(user, "부품");
    await user.click(screen.getByRole("button", { name: /^저항$/ }));
    await user.keyboard("]");
    expect(screen.getByText("선택된 소자")).toBeInTheDocument();
    expect(screen.queryByText("다음 단계")).not.toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByText("선택된 소자")).not.toBeInTheDocument();
    expect(screen.getByText("다음 단계")).toBeInTheDocument();
  });
});
