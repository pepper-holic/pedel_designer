import type { PartInstance, Wire } from "./types";

export interface CircuitSnapshot {
  parts: PartInstance[];
  wires: Wire[];
}

export interface HistoryState {
  past: CircuitSnapshot[];
  present: CircuitSnapshot;
  future: CircuitSnapshot[];
}

const MAX_HISTORY = 50;

export function createHistory(initial: CircuitSnapshot): HistoryState {
  return { past: [], present: initial, future: [] };
}

/** Discrete action (add/delete/rotate/param change/load template): pushes the current present onto past. */
export function pushSnapshot(state: HistoryState, next: CircuitSnapshot): HistoryState {
  return { past: [...state.past, state.present].slice(-MAX_HISTORY), present: next, future: [] };
}

/** Continuous update (e.g. mid-drag): replaces present without creating an undo step. */
export function replacePresent(state: HistoryState, next: CircuitSnapshot): HistoryState {
  return { ...state, present: next };
}

/** Finalizes a continuous update by recording the pre-drag snapshot as a single undo step. */
export function commitPrevious(state: HistoryState, previous: CircuitSnapshot): HistoryState {
  return { past: [...state.past, previous].slice(-MAX_HISTORY), present: state.present, future: [] };
}

export function undo(state: HistoryState): HistoryState {
  if (state.past.length === 0) return state;
  const previous = state.past[state.past.length - 1];
  return { past: state.past.slice(0, -1), present: previous, future: [state.present, ...state.future] };
}

export function redo(state: HistoryState): HistoryState {
  if (state.future.length === 0) return state;
  const next = state.future[0];
  return { past: [...state.past, state.present], present: next, future: state.future.slice(1) };
}

export function canUndo(state: HistoryState): boolean {
  return state.past.length > 0;
}

export function canRedo(state: HistoryState): boolean {
  return state.future.length > 0;
}
