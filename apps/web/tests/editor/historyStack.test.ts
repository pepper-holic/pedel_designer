import { describe, expect, it } from "vitest";
import { canRedo, canUndo, commitPrevious, createHistory, pushSnapshot, redo, replacePresent, undo, type CircuitSnapshot } from "../../src/editor/historyStack";

function snap(id: string): CircuitSnapshot {
  return { parts: [{ id, type: "resistor", x: 0, y: 0, rotation: 0, params: {} }], wires: [] };
}

describe("historyStack", () => {
  it("starts with no undo/redo available", () => {
    const state = createHistory(snap("a"));
    expect(canUndo(state)).toBe(false);
    expect(canRedo(state)).toBe(false);
  });

  it("pushSnapshot records an undo step and clears redo", () => {
    let state = createHistory(snap("a"));
    state = pushSnapshot(state, snap("b"));
    expect(state.present).toEqual(snap("b"));
    expect(canUndo(state)).toBe(true);
    expect(canRedo(state)).toBe(false);
  });

  it("undo restores the previous snapshot and enables redo", () => {
    let state = createHistory(snap("a"));
    state = pushSnapshot(state, snap("b"));
    state = undo(state);
    expect(state.present).toEqual(snap("a"));
    expect(canUndo(state)).toBe(false);
    expect(canRedo(state)).toBe(true);
  });

  it("redo re-applies an undone snapshot", () => {
    let state = createHistory(snap("a"));
    state = pushSnapshot(state, snap("b"));
    state = undo(state);
    state = redo(state);
    expect(state.present).toEqual(snap("b"));
    expect(canRedo(state)).toBe(false);
  });

  it("undo/redo on an empty stack is a no-op", () => {
    const state = createHistory(snap("a"));
    expect(undo(state)).toEqual(state);
    expect(redo(state)).toEqual(state);
  });

  it("replacePresent does not create an undo step (live drag updates)", () => {
    let state = createHistory(snap("a"));
    state = replacePresent(state, snap("a-moved"));
    expect(state.present).toEqual(snap("a-moved"));
    expect(canUndo(state)).toBe(false);
  });

  it("commitPrevious finalizes a drag as a single undo step regardless of live updates in between", () => {
    let state = createHistory(snap("a"));
    const preDrag = state.present;
    state = replacePresent(state, snap("a-mid"));
    state = replacePresent(state, snap("a-final"));
    state = commitPrevious(state, preDrag);
    expect(state.present).toEqual(snap("a-final"));
    expect(state.past).toEqual([snap("a")]);
    expect(canUndo(state)).toBe(true);

    state = undo(state);
    expect(state.present).toEqual(snap("a"));
  });

  it("caps history depth at 50 entries", () => {
    let state = createHistory(snap("0"));
    for (let i = 1; i <= 60; i++) state = pushSnapshot(state, snap(String(i)));
    expect(state.past.length).toBe(50);
    expect(state.past[0]).toEqual(snap("10"));
  });
});
