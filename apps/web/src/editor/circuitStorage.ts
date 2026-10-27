import type { BlockInstance, PartInstance, Probe, Wire } from "./types";

export const CIRCUIT_STORAGE_KEY = "pedal-designer:circuit";

/** Bumped whenever the saved shape changes in a way old saves can't just default their way around
 * (a genuinely new/renamed field, not an additive one with an obvious empty default). Saves written
 * before this field existed are treated as version 1. */
export const CURRENT_SCHEMA_VERSION = 1;

export interface StoredCircuit {
  schemaVersion: number;
  parts: PartInstance[];
  wires: Wire[];
  blocks: BlockInstance[];
  outputNode: string;
  inputGain: number;
  /** Measurement points. Optional and additive - saves from before probes existed load with none. */
  probes?: Probe[];
}

export function serializeCircuit(circuit: StoredCircuit): string {
  return JSON.stringify(circuit);
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
      // Saves written before schemaVersion existed are version 1 by definition - there's been only
      // one shape so far, so no migration branch is needed yet. Add one here the day version 2 ships.
      schemaVersion: typeof parsed.schemaVersion === "number" ? parsed.schemaVersion : 1,
      parts: parsed.parts,
      wires: parsed.wires,
      // Circuits saved before the block feature existed have no `blocks` field - default to empty
      // rather than rejecting the whole saved circuit.
      blocks: Array.isArray(parsed.blocks) ? parsed.blocks : [],
      outputNode: typeof parsed.outputNode === "string" ? parsed.outputNode : "",
      inputGain: typeof parsed.inputGain === "number" ? parsed.inputGain : 0.5,
      probes: Array.isArray(parsed.probes) ? parsed.probes.filter(isProbe) : [],
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
