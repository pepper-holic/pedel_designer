/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QuickAddPalette } from "../../src/editor/QuickAddPalette";

afterEach(() => {
  cleanup();
});

describe("QuickAddPalette", () => {
  it("adds a resistor pre-set to the clicked value", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<QuickAddPalette onAdd={onAdd} />);

    await user.click(screen.getByText("4.7kΩ"));
    expect(onAdd).toHaveBeenCalledWith("resistor", { resistance: 4_700 });
  });

  it("adds a diode pre-set to a named model's real SPICE params", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<QuickAddPalette onAdd={onAdd} />);

    await user.click(screen.getByText("1N34A (저마늄)"));
    expect(onAdd).toHaveBeenCalledWith("diode", expect.objectContaining({ emissionCoefficient: 1.2 }));
  });

  it("adds an op-amp pre-set to a named model's GBWP/slew/rail params", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<QuickAddPalette onAdd={onAdd} />);

    await user.click(screen.getByText("TL072/TL071 (JFET 입력)"));
    expect(onAdd).toHaveBeenCalledWith("opamp", expect.objectContaining({ slewRateVPerUs: 13 }));
  });
});
