/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Analyzer } from "../../src/viz/Analyzer";
import { analyzerBus, beginActivity } from "../../src/audio/analyzerBus";
import { computeSpectrum } from "../../src/core/analysis/spectrum";
import { setAnalyzerSettings } from "../../src/viz/analyzerSettings";
import { installFakeCanvas } from "../helpers/fakeCanvas";

const fs = 48000;
const tone = Float64Array.from({ length: fs / 2 }, (_, i) => 0.3 * Math.sin((2 * Math.PI * 220 * i) / fs) + 0.05 * Math.sin((2 * Math.PI * 660 * i) / fs));
const series = [{ label: "출력", color: "#191a10", spectrum: computeSpectrum(tone, fs, { fftSize: 8192 }) }];

/** An AudioContext with analysers that report a fixed spectrum. */
function fakeContext() {
  const makeAnalyser = () => {
    const node = {
      fftSize: 2048,
      smoothingTimeConstant: 0.8,
      get frequencyBinCount() {
        return node.fftSize / 2;
      },
      getFloatFrequencyData: (out: Float32Array) => out.fill(-50),
    };
    return node;
  };
  return { sampleRate: fs, createAnalyser: makeAnalyser } as unknown as AudioContext;
}

let calls: string[];
beforeEach(() => {
  calls = installFakeCanvas().calls;
  vi.useFakeTimers();
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 16) as unknown as number);
  vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Analyzer", () => {
  it("draws the smoothed spectrum with axes and a hover readout", () => {
    render(<Analyzer series={series} />);
    expect(calls).toContain("quadraticCurveTo");
    expect(calls).toContain("fillText");
    const canvas = screen.getByRole("img", { name: /스펙트럼 분석기/ });
    // jsdom lays nothing out; give the canvas the size it was drawn at.
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, right: 800, bottom: 260, width: 800, height: 260, x: 0, y: 0, toJSON: () => ({}) });
    calls.length = 0;
    fireEvent.mouseMove(canvas, { clientX: 300, clientY: 50 });
    expect(calls).toContain("fillRect"); // readout box
    fireEvent.mouseLeave(canvas);
  });

  it("goes live while the analyzer bus is fed, then settles back to the fixed spectrum", () => {
    setAnalyzerSettings({ resolution: 4096, peakHold: true });
    const bus = analyzerBus(fakeContext());
    render(<Analyzer series={series} />);
    expect(screen.queryByText("RTA")).not.toBeInTheDocument();

    let end = () => {};
    act(() => {
      end = beginActivity(bus);
    });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.getByText(/출력 \(실시간\)/)).toBeInTheDocument();
    // The analyser's FFT length follows the resolution setting.
    expect(bus.post.fftSize).toBe(4096);

    act(() => end());
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.queryByText(/출력 \(실시간\)/)).not.toBeInTheDocument();
  });
});
