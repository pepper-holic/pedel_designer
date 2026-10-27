import { describe, expect, it } from "vitest";
import {
  CIRCUIT_STORAGE_KEY,
  clearCircuitStorage,
  deserializeCircuit,
  loadCircuitFromStorage,
  saveCircuitToStorage,
  serializeCircuit,
  type StoredCircuit,
} from "../../src/editor/circuitStorage";

function fakeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
    map,
  };
}

const sample: StoredCircuit = {
  schemaVersion: 2,
  parts: [{ id: "r1", type: "resistor", x: 10, y: 20, rotation: 0, params: { resistance: 1000 } }],
  wires: [],
  blocks: [],
  outputNode: "n2",
  inputGain: 0.75,
  probes: [{ id: "P1", terminal: { partId: "r1", terminalId: "a" }, label: "입력", color: "#d1495b" }],
};

describe("circuitStorage", () => {
  it("round-trips a circuit through serialize/deserialize", () => {
    expect(deserializeCircuit(serializeCircuit(sample))).toEqual(sample);
  });

  it("saves under the expected key and loads it back", () => {
    const storage = fakeStorage();
    saveCircuitToStorage(storage, sample);
    expect(storage.map.has(CIRCUIT_STORAGE_KEY)).toBe(true);
    expect(loadCircuitFromStorage(storage)).toEqual(sample);
  });

  it("returns null when nothing is stored", () => {
    const storage = fakeStorage();
    expect(loadCircuitFromStorage(storage)).toBeNull();
  });

  it("returns null for malformed JSON instead of throwing", () => {
    const storage = fakeStorage();
    storage.setItem(CIRCUIT_STORAGE_KEY, "{not json");
    expect(loadCircuitFromStorage(storage)).toBeNull();
  });

  it("returns null when required fields are missing", () => {
    expect(deserializeCircuit(JSON.stringify({ foo: "bar" }))).toBeNull();
  });

  it("defaults schemaVersion/outputNode/inputGain/blocks/probes when absent", () => {
    const partial = deserializeCircuit(JSON.stringify({ parts: [], wires: [] }));
    expect(partial).toEqual({ schemaVersion: 2, parts: [], wires: [], blocks: [], outputNode: "", inputGain: 0.5, probes: [] });
  });

  it("migrates version-1 blocks (a tint only) to version 2 with no ports, no knobs, expanded", () => {
    const v1 = JSON.stringify({ ...sample, schemaVersion: 1, blocks: [{ id: "blk1", defId: "buffer-follower", label: "버퍼", category: "buffer" }] });
    const loaded = deserializeCircuit(v1)!;
    expect(loaded.schemaVersion).toBe(2);
    expect(loaded.blocks).toEqual([{ id: "blk1", defId: "buffer-follower", label: "버퍼", category: "buffer", ports: [], params: [], collapsed: false }]);
  });

  it("drops malformed probe entries instead of rejecting the whole circuit", () => {
    const raw = JSON.stringify({ ...sample, probes: [...sample.probes!, { id: "P2" }, null, "x"] });
    expect(deserializeCircuit(raw)?.probes).toEqual(sample.probes);
  });

  it("clearCircuitStorage removes the stored entry", () => {
    const storage = fakeStorage();
    saveCircuitToStorage(storage, sample);
    clearCircuitStorage(storage);
    expect(storage.map.has(CIRCUIT_STORAGE_KEY)).toBe(false);
  });
});
