import type { BlockInstance, PartInstance, Probe, Wire } from "./types";
import { DEFAULT_APPEARANCE, isPedalAppearance, type PedalAppearance } from "./player/pedalAppearance";

export const CIRCUIT_STORAGE_KEY = "pedal-designer:circuit";

/** Bumped whenever the saved shape changes in a way old saves can't just default their way around
 * (a genuinely new/renamed field, not an additive one with an obvious empty default). Saves written
 * before this field existed are treated as version 1. */
export const CURRENT_SCHEMA_VERSION = 2;

export interface StoredCircuit {
  schemaVersion: number;
  parts: PartInstance[];
  wires: Wire[];
  blocks: BlockInstance[];
  outputNode: string;
  inputGain: number;
  /** Measurement points. Optional and additive - saves from before probes existed load with none. */
  probes?: Probe[];
  /** Cosmetic only - the player view's pedal face and exported enclosure art. Optional and
   * additive; a save from before this existed (or that never touched it) gets DEFAULT_APPEARANCE,
   * which matches the look those saves always had. */
  appearance?: PedalAppearance;
}

export function serializeCircuit(circuit: StoredCircuit): string {
  return JSON.stringify(circuit);
}

/**
 * Version 1 blocks were only a tint over their parts: no ports, no knobs, never collapsed. Version 2
 * adds those; a v1 block simply gets none, which renders exactly as before. (Ports are re-derived
 * from the wiring the first time the block is collapsed - see setBlockCollapsed.)
 */
function migrateBlocks(blocks: unknown[]): BlockInstance[] {
  return blocks
    .filter((b): b is BlockInstance => !!b && typeof (b as BlockInstance).id === "string")
    .map((b) => ({
      ...b,
      defId: typeof b.defId === "string" ? b.defId : null,
      ports: Array.isArray(b.ports) ? b.ports : [],
      params: Array.isArray(b.params) ? b.params : [],
      collapsed: b.collapsed === true,
    }));
}

function isProbe(value: unknown): value is Probe {
  const p = value as Probe;
  return (
    !!p &&
    typeof p.id === "string" &&
    typeof p.label === "string" &&
    typeof p.color === "string" &&
    typeof p.terminal?.partId === "string" &&
    typeof p.terminal?.terminalId === "string"
  );
}

export function deserializeCircuit(raw: string): StoredCircuit | null {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.parts) || !Array.isArray(parsed.wires)) return null;
    return {
      // Whatever version was read, what comes out is the current shape - migrateBlocks below is the
      // only version-specific step so far.
      schemaVersion: CURRENT_SCHEMA_VERSION,
      parts: parsed.parts,
      wires: parsed.wires,
      // Circuits saved before the block feature existed have no `blocks` field - default to empty
      // rather than rejecting the whole saved circuit.
      blocks: Array.isArray(parsed.blocks) ? migrateBlocks(parsed.blocks) : [],
      outputNode: typeof parsed.outputNode === "string" ? parsed.outputNode : "",
      inputGain: typeof parsed.inputGain === "number" ? parsed.inputGain : 0.5,
      probes: Array.isArray(parsed.probes) ? parsed.probes.filter(isProbe) : [],
      appearance: isPedalAppearance(parsed.appearance) ? parsed.appearance : DEFAULT_APPEARANCE,
    };
  } catch {
    return null;
  }
}

export function saveCircuitToStorage(storage: Pick<Storage, "setItem">, circuit: StoredCircuit): void {
  storage.setItem(CIRCUIT_STORAGE_KEY, serializeCircuit(circuit));
}

export function loadCircuitFromStorage(storage: Pick<Storage, "getItem">): StoredCircuit | null {
  const raw = storage.getItem(CIRCUIT_STORAGE_KEY);
  if (!raw) return null;
  return deserializeCircuit(raw);
}

export function clearCircuitStorage(storage: Pick<Storage, "removeItem">): void {
  storage.removeItem(CIRCUIT_STORAGE_KEY);
}
