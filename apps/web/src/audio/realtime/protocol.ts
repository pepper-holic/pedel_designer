import type { Netlist } from "../../core/solver/types";

/** Messages the editor posts to the real-time engine (inside the AudioWorklet). */
export type ToEngine =
  /** (Re)starts playing: a circuit, where to drive and listen, and the input loop at the context's rate. */
  | { type: "start"; netlist: Netlist; inputSourceId: string; outputNode: string; input: Float32Array; inputGain: number }
  /** A changed circuit - a knob turned, a value edited. Keeps the circuit's state when only values changed. */
  | { type: "netlist"; netlist: Netlist }
  | { type: "inputGain"; inputGain: number }
  | { type: "input"; input: Float32Array }
  | { type: "stop" };

/** Messages the engine posts back. */
export type FromEngine =
  /** Sent a few times a second while playing. */
  | {
      type: "stats";
      /** Time spent solving / audio time produced, over the last report window: above 1 the circuit
       * cannot keep up and the browser drops audio. */
      load: number;
      /** Samples whose Newton solve did not converge since the last report. */
      nonConvergent: number;
      /** Peak output level after the automatic gain, 0..1. */
      level: number;
      /** The most recent output in volts (DC removed, before the automatic gain), oldest first -
       * enough for a live spectrum that shows real level changes, not the normalised ones. */
      snapshot: Float32Array;
    }
  | { type: "error"; message: string };
