/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TransportBar, type RealtimeControl } from "../../../src/editor/shell/TransportBar";

afterEach(cleanup);

function renderBar(realtime: RealtimeControl, overrides: Partial<React.ComponentProps<typeof TransportBar>> = {}) {
  const props: React.ComponentProps<typeof TransportBar> = {
    source: null,
    onUseTestSignal: vi.fn(),
    onFileChange: vi.fn(),
    inputGain: 0.5,
    onInputGainChange: vi.fn(),
    realtime,
    preview: { enabled: true, onEnabledChange: vi.fn(), busy: false },
    outputNode: "out",
    onOutputNodeChange: vi.fn(),
    netNames: ["0", "in", "out"],
    cabinet: { enabled: false, variant: "brightCab4x12", onEnabledChange: vi.fn(), onVariantChange: vi.fn() },
    status: "준비",
    ...overrides,
  };
  render(<TransportBar {...props} />);
  return props;
}

const idle: RealtimeControl = { supported: true, active: false, stats: null, onToggle: () => {} };

describe("TransportBar", () => {
  it("starts real-time playback from its button", async () => {
    const onToggle = vi.fn();
    renderBar({ ...idle, onToggle });
    await userEvent.click(screen.getByRole("button", { name: "실시간 재생" }));
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it("shows the solver load while playing and flags a heavy one", () => {
    renderBar({ supported: true, active: true, stats: { load: 0.92, level: 0.5, nonConvergent: 3 }, onToggle: () => {} });
    expect(screen.getByRole("button", { name: "실시간 정지" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("부하 92%")).toHaveClass("transport-warn");
    expect(screen.getByText("수렴 실패 3")).toBeInTheDocument();
  });

  it("is disabled where the browser has no AudioWorklet", () => {
    renderBar({ ...idle, supported: false });
    expect(screen.getByRole("button", { name: "실시간 재생" })).toBeDisabled();
  });

  it("picks a built-in input signal and the point listened to", async () => {
    const props = renderBar(idle);
    await userEvent.selectOptions(screen.getByLabelText("입력"), "signal:note");
    expect(props.onUseTestSignal).toHaveBeenCalledWith("note");
    await userEvent.selectOptions(screen.getByLabelText("듣는 지점"), "in");
    expect(props.onOutputNodeChange).toHaveBeenCalledWith("in");
    // Ground is never something to listen to.
    expect(screen.queryByRole("option", { name: "0" })).not.toBeInTheDocument();
  });

  it("turns the cabinet on by choosing one and off with 끔", async () => {
    const props = renderBar(idle);
    await userEvent.selectOptions(screen.getByLabelText("캐비닛"), "brightCab4x12");
    expect(props.cabinet.onVariantChange).toHaveBeenCalledWith("brightCab4x12");
    expect(props.cabinet.onEnabledChange).toHaveBeenCalledWith(true);
    cleanup();
    const on = renderBar(idle, { cabinet: { enabled: true, variant: "brightCab4x12", onEnabledChange: vi.fn(), onVariantChange: vi.fn() } });
    await userEvent.selectOptions(screen.getByLabelText("캐비닛"), "");
    expect(on.cabinet.onEnabledChange).toHaveBeenCalledWith(false);
  });

  it("announces the status", () => {
    renderBar(idle, { status: "시뮬레이션 완료" });
    expect(screen.getByRole("status")).toHaveTextContent("시뮬레이션 완료");
  });
});
