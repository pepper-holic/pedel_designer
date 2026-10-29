/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EnclosurePanel } from "../../../src/editor/pcb/EnclosurePanel";
import { DEFAULT_APPEARANCE } from "../../../src/editor/player/pedalAppearance";

afterEach(cleanup);

const controls = [
  { label: "DRIVE", kind: "knob" as const },
  { label: "TONE", kind: "knob" as const },
];

describe("EnclosurePanel", () => {
  it("picks the smallest box the board fits and says so", () => {
    render(<EnclosurePanel controls={controls} appearance={DEFAULT_APPEARANCE} title="테스트" board={{ w: 50, h: 40, source: "PCB" }} />);
    expect(screen.getByLabelText("인클로저")).toHaveValue("1590B");
    expect(screen.getByRole("status")).toHaveTextContent("들어갑니다");
  });

  it("says when the board does not fit the chosen box and what would", async () => {
    render(<EnclosurePanel controls={controls} appearance={DEFAULT_APPEARANCE} title="테스트" board={{ w: 58, h: 100, source: "PCB" }} />);
    await userEvent.selectOptions(screen.getByLabelText("인클로저"), "1590B");
    expect(screen.getByRole("status")).toHaveTextContent("들어가지 않습니다 - 125B를 권장합니다");
  });

  it("drags a hole and can go back to the default layout", async () => {
    render(<EnclosurePanel controls={controls} appearance={DEFAULT_APPEARANCE} title="테스트" board={null} />);
    const reset = screen.getByRole("button", { name: "기본 배치로" });
    expect(reset).toBeDisabled();
    const knob = document.querySelector('[data-part="pot-0"]')!;
    fireEvent.pointerDown(knob, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(knob, { clientX: 100, clientY: 160, pointerId: 1 });
    fireEvent.pointerUp(knob, { pointerId: 1 });
    expect(reset).toBeEnabled();
    await userEvent.click(reset);
    expect(reset).toBeDisabled();
  });
});
