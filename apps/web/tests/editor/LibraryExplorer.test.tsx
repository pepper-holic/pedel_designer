/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LibraryExplorer } from "../../src/editor/LibraryExplorer";
import type { PedalPreset } from "../../src/core/library/presets";

afterEach(() => {
  cleanup();
});

function preset(overrides: Partial<PedalPreset>): PedalPreset {
  return {
    id: "p1",
    name: "프리셋",
    description: "프리셋 설명",
    category: "오버드라이브",
    inputSourceId: "V1",
    tapNodes: [],
    outputNode: "out",
    defaultParams: {},
    build: () => ({ elements: [] }),
    ...overrides,
  };
}

const presets: PedalPreset[] = [preset({ id: "od1", name: "오버드라이브 A", category: "오버드라이브" })];

describe("LibraryExplorer", () => {
  it("shows the preset section expanded and the block section collapsed by default", () => {
    render(<LibraryExplorer presets={presets} wiringPresets={[]} loadedPresetId={null} onLoadTemplate={vi.fn()} onLoadWiring={vi.fn()} onAddBlock={vi.fn()} />);
    expect(screen.getByText("오버드라이브 A")).toBeInTheDocument();
    expect(screen.queryByText("버퍼 (Op-Amp 팔로워)")).not.toBeInTheDocument();
  });

  it("expanding the block section reveals its category groups and items", async () => {
    const user = userEvent.setup();
    render(<LibraryExplorer presets={presets} wiringPresets={[]} loadedPresetId={null} onLoadTemplate={vi.fn()} onLoadWiring={vi.fn()} onAddBlock={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /기능 블록/ }));
    expect(screen.getByText("버퍼 (Op-Amp 팔로워)")).toBeInTheDocument();
  });

  it("clicking a preset calls onLoadTemplate and shows its description in the preview box", async () => {
    const user = userEvent.setup();
    const onLoadTemplate = vi.fn();
    render(<LibraryExplorer presets={presets} wiringPresets={[]} loadedPresetId={null} onLoadTemplate={onLoadTemplate} onLoadWiring={vi.fn()} onAddBlock={vi.fn()} />);

    await user.click(screen.getByText("오버드라이브 A"));
    // The second argument is the optional topology variant - undefined here because clicking the
    // preset row itself means "load the default branch".
    expect(onLoadTemplate).toHaveBeenCalledWith(presets[0], undefined);
    expect(screen.getByText("프리셋 설명")).toBeInTheDocument();
  });

  it("clicking a block calls onAddBlock and shows its description in the preview box", async () => {
    const user = userEvent.setup();
    const onAddBlock = vi.fn();
    render(<LibraryExplorer presets={presets} wiringPresets={[]} loadedPresetId={null} onLoadTemplate={vi.fn()} onLoadWiring={vi.fn()} onAddBlock={onAddBlock} />);

    await user.click(screen.getByRole("button", { name: /기능 블록/ }));
    await user.click(screen.getByText("버퍼 (Op-Amp 팔로워)"));
    expect(onAddBlock).toHaveBeenCalled();
    expect(screen.getByText(/이상적 연산증폭기 유닛 게인 팔로워/)).toBeInTheDocument();
  });

  it("searching matches across both presets and blocks regardless of collapse state", async () => {
    const user = userEvent.setup();
    render(<LibraryExplorer presets={presets} wiringPresets={[]} loadedPresetId={null} onLoadTemplate={vi.fn()} onLoadWiring={vi.fn()} onAddBlock={vi.fn()} />);

    await user.type(screen.getByLabelText("템플릿 검색"), "버퍼");
    expect(screen.getByText("버퍼 (Op-Amp 팔로워)")).toBeInTheDocument();
  });

  it("모두 접기 collapses every top section and category, and toggles to 모두 펼치기", async () => {
    const user = userEvent.setup();
    render(<LibraryExplorer presets={presets} wiringPresets={[]} loadedPresetId={null} onLoadTemplate={vi.fn()} onLoadWiring={vi.fn()} onAddBlock={vi.fn()} />);

    expect(screen.getByText("오버드라이브 A")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "모두 접기" }));
    expect(screen.queryByText("오버드라이브 A")).not.toBeInTheDocument();
    expect(screen.queryByText("오버드라이브")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "모두 펼치기" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "모두 펼치기" }));
    expect(screen.getByText("오버드라이브 A")).toBeInTheDocument();
  });
});
