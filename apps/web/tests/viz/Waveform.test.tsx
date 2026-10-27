/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Waveform } from "../../src/viz/Waveform";
import { installFakeCanvas } from "../helpers/fakeCanvas";

const data = Float64Array.from({ length: 48000 }, (_, i) => Math.sin((2 * Math.PI * 110 * i) / 48000));
const traces = [{ label: "out", data, color: "#e08a00" }];

let calls: string[];
beforeEach(() => {
  calls = installFakeCanvas().calls;
});
afterEach(cleanup);

describe("Waveform", () => {
  it("zooms with the wheel around the cursor, pans by dragging, and resets on double-click", () => {
    render(<Waveform traces={traces} durationSeconds={1} />);
    const canvas = screen.getByRole("img", { name: /파형/ });
    expect(calls).toContain("fill"); // zoomed out: filled envelope
    for (let i = 0; i < 20; i++) fireEvent.wheel(canvas, { deltaY: -300, clientX: 100 });
    const reset = screen.getByRole("button", { name: /전체 보기/ });
    expect(reset).toBeInTheDocument();
    // Deep zoom: individual samples are marked.
    expect(calls).toContain("arc");

    fireEvent.pointerDown(canvas, { clientX: 400, pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: 300, pointerId: 1 });
    fireEvent.pointerUp(canvas, { pointerId: 1 });

    fireEvent.doubleClick(canvas);
    expect(screen.queryByRole("button", { name: /전체 보기/ })).not.toBeInTheDocument();
  });

  it("starts over at the full view for a new run", () => {
    const { rerender } = render(<Waveform traces={traces} durationSeconds={1} />);
    const canvas = screen.getByRole("img", { name: /파형/ });
    fireEvent.wheel(canvas, { deltaY: -600, clientX: 100 });
    expect(screen.getByRole("button", { name: /전체 보기/ })).toBeInTheDocument();
    rerender(<Waveform traces={[{ ...traces[0] }]} durationSeconds={1} />);
    expect(screen.queryByRole("button", { name: /전체 보기/ })).not.toBeInTheDocument();
  });
});
