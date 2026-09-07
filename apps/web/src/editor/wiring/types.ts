import type { CircuitSnapshot } from "../historyStack";
import type { TerminalRef } from "../types";

/** Coarse grouping for the wiring explorer tree, in the order a builder meets them. */
export type WiringCategory = "픽업 기본" | "셀렉터" | "코일 스위칭" | "톤 회로" | "베이스" | "온보드 액티브";

/**
 * A guitar-wiring preset, stored as a **part-level** canvas snapshot rather than a netlist.
 *
 * `PedalPreset.build()` returns solver elements, and `graphFromNetlist` turns each element into one
 * canvas part. That is fine for pedal circuits, but pickups, potentiometers and switches are
 * *composite* parts - one canvas part that expands into several solver elements at netlist time. A
 * netlist-level preset would therefore hand the user four loose parts instead of a pickup, with no
 * knob to turn and no coil to split (docs/plan-guitar-wiring.md §12).
 *
 * So these presets carry the parts and wires directly. The shape is exactly `CircuitSnapshot`, the
 * same thing the undo stack and localStorage already round-trip, so loading one is just a commit.
 */
export interface WiringPreset {
  id: string;
  name: string;
  description: string;
  category: WiringCategory;
  snapshot: CircuitSnapshot;
  /**
   * Which terminal's net to select as the output after loading. Named by terminal rather than by
   * net name because net names ("n1", "n2", ...) are assigned by union-find at load time and are
   * not stable properties of the circuit.
   */
  outputTerminal: TerminalRef;
  /** Same meaning as PedalPreset.archive - set when the wiring is re-derived from public material. */
  archive?: {
    sourceRefs: { label: string; url: string }[];
    disclaimer: string;
  };
}
