/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OutputAudioPanel, type RealtimeControl } from "../../src/editor/OutputAudioPanel";

afterEach(cleanup);

function renderPanel(realtime: RealtimeControl) {
  render(
    <OutputAudioPanel
      outputNode="out"
      onOutputNodeChange={() => {}}
      netNames={["0", "out"]}
      inputGain={0.5}
      onInputGainChange={() => {}}
      hasSample={false}
      onFileChange={() => {}}
      onUseTestSignal={() => {}}
      useTrapezoidal={false}
      onUseTrapezoidalChange={() => {}}
      canRun={false}
      onRun={() => {}}
      status=""
      realtime={realtime}
    />,
  );
}

describe("OutputAudioPanel real-time row", () => {
  it("starts real-time playback from its button", async () => {
    const onToggle = vi.fn();
    renderPanel({ supported: true, active: false, stats: null, onToggle });
    await userEvent.click(screen.getByRole("button", { name: "▶ 실시간 재생" }));
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it("shows the solver load while playing and flags a heavy one", () => {
    renderPanel({ supported: true, active: true, stats: { load: 0.92, level: 0.5, nonConvergent: 3 }, onToggle: () => {} });
    expect(screen.getByRole("button", { name: "■ 실시간 정지" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("부하 92%")).toHaveClass("realtime-load-high");
    expect(screen.getByText("수렴 실패 3")).toBeInTheDocument();
  });

  it("is disabled where the browser has no AudioWorklet", () => {
    renderPanel({ supported: false, active: false, stats: null, onToggle: () => {} });
    expect(screen.getByRole("button", { name: "▶ 실시간 재생" })).toBeDisabled();
  });
});
