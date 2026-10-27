/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SchematicEditor } from "../../src/editor/SchematicEditor";

beforeEach(() => {
  localStorage.clear();
  HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue(null) as unknown as typeof HTMLCanvasElement.prototype.getContext;
});
afterEach(() => cleanup());

async function addLibraryBlock(user: ReturnType<typeof userEvent.setup>, name: RegExp) {
  await user.click(screen.getByRole("button", { name: "템플릿/블록" }));
  const blocksHeader = screen.getByRole("button", { name: /기능 블록/ });
  if (blocksHeader.getAttribute("aria-expanded") === "false") await user.click(blocksHeader);
  await user.click(screen.getByRole("button", { name }));
}

const inspector = () => screen.getByText("선택된 블록").closest<HTMLElement>(".panel")!;

describe("block workflow", () => {
  it("a placed library block is selected, can be renamed, collapsed, turned and expanded", async () => {
    const user = userEvent.setup();
    const { container } = render(<SchematicEditor />);
    await addLibraryBlock(user, /톤 \(Big Muff 스타일 블렌드\)/);

    expect(within(inspector()).getByDisplayValue("톤 (Big Muff 스타일 블렌드)")).toBeInTheDocument();
    fireEvent.change(within(inspector()).getByLabelText("이름"), { target: { value: "내 톤" } });
    expect(container.querySelector('g[data-block-id="blk1"]')).toHaveTextContent("내 톤");

    await user.click(within(inspector()).getByRole("button", { name: /접기 \(블랙박스\)/ }));
    expect(container.querySelector('g[data-block-id="blk1"][data-collapsed="true"]')).not.toBeNull();
    expect(container.querySelectorAll('g[data-block-id="blk1"] [data-port-id]')).toHaveLength(2);

    fireEvent.change(within(inspector()).getByLabelText("TONE 노브", { exact: true }), { target: { value: "0.8" } });
    expect(container.querySelector('g[data-block-id="blk1"]')).toHaveTextContent("TONE 80%");

    await user.click(within(inspector()).getByRole("button", { name: /펼치기/ }));
    expect(container.querySelector('g[data-block-id="blk1"][data-collapsed="false"]')).not.toBeNull();
  });

  it("ports can be renamed and re-kinded, and knobs hidden", async () => {
    const user = userEvent.setup();
    render(<SchematicEditor />);
    await addLibraryBlock(user, /출력 볼륨/);
    fireEvent.change(within(inspector()).getByLabelText("OUT 포트 이름"), { target: { value: "AMP" } });
    expect(within(inspector()).getByLabelText("AMP 포트 종류")).toHaveValue("out");
    fireEvent.change(within(inspector()).getByLabelText("AMP 포트 종류"), { target: { value: "aux" } });
    expect(within(inspector()).getByLabelText("AMP 포트 종류")).toHaveValue("aux");
    await user.click(within(inspector()).getByRole("button", { name: "VOLUME 노브 숨기기" }));
    expect(within(inspector()).getByText(/노출된 노브가 없습니다/)).toBeInTheDocument();
  });

  it("saving a block puts it in 내 블록, from where it can be placed again collapsed", async () => {
    const user = userEvent.setup();
    const { container } = render(<SchematicEditor />);
    await addLibraryBlock(user, /클리핑 단 \(LED\)/);
    await user.click(within(inspector()).getByRole("button", { name: "내 블록으로 저장" }));
    expect(screen.getByText(/내 블록에 저장했습니다/)).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("pedal-designer:user-blocks")!)).toHaveLength(1);

    const saved = screen.getAllByRole("button", { name: /클리핑 단 \(LED\)/ }).find((b) => b.textContent?.includes("내 블록"))!;
    await user.click(saved);
    expect(container.querySelector('g[data-block-id="blk2"][data-collapsed="true"]')).not.toBeNull();
  });

  it("ungrouping leaves the parts and wires, and deleting a block removes all of it", async () => {
    const user = userEvent.setup();
    const { container } = render(<SchematicEditor />);
    await addLibraryBlock(user, /클리핑 단 \(대칭 실리콘\)/);
    const partsBefore = container.querySelectorAll("g[data-part-id]").length;
    await user.click(within(inspector()).getByRole("button", { name: "블록 해제" }));
    expect(container.querySelectorAll("g[data-block-id]")).toHaveLength(0);
    expect(container.querySelectorAll("g[data-part-id]")).toHaveLength(partsBefore);

    await addLibraryBlock(user, /클리핑 단 \(게르마늄\)/);
    await user.click(within(inspector()).getByRole("button", { name: "블록 삭제" }));
    expect(container.querySelectorAll("g[data-block-id]")).toHaveLength(0);
    expect(container.querySelectorAll("g[data-part-id]")).toHaveLength(partsBefore);
  });

  it("a part inside a block can surface one of its values as a block knob", async () => {
    const user = userEvent.setup();
    const { container } = render(<SchematicEditor />);
    await addLibraryBlock(user, /클리핑 단 \(대칭 실리콘\)/);
    const hit = container.querySelector<SVGRectElement>('g[data-part-id="blk1_R1"] rect[fill="transparent"]')!;
    fireEvent.mouseDown(hit);
    fireEvent.mouseUp(hit);
    await user.selectOptions(screen.getByLabelText("블록 노브로 표시"), "resistance");
    await user.click(screen.getByRole("button", { name: "블록 선택" }));
    expect(within(inspector()).getByLabelText("blk1_R1 노브 이름")).toBeInTheDocument();
  });
});
