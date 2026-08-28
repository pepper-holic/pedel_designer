import type { PartInstance, Wire } from "./types";

export const CIRCUIT_STORAGE_KEY = "pedal-designer:circuit";

export interface StoredCircuit {
  parts: PartInstance[];
  wires: Wire[];
  outputNode: string;
  inputGain: number;
}

export function serializeCircuit(circuit: StoredCircuit): string {
  return JSON.stringify(circuit);
}

export function deserializeCircuit(raw: string): StoredCircuit | null {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.parts) || !Array.isArray(parsed.wires)) return null;
    return {
      parts: parsed.parts,
      wires: parsed.wires,
      outputNode: typeof parsed.outputNode === "string" ? parsed.outputNode : "",
      inputGain: typeof parsed.inputGain === "number" ? parsed.inputGain : 0.5,
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
