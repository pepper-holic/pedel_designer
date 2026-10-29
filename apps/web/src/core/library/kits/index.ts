import type { PedalPreset } from "../types";
import type { KitCircuit } from "./types";
import { kitToPreset, UnsupportedKitError } from "./kitToPreset";

/** Every circuit read off a kit board so far (one JSON file per kit, written by the
 * pcb-to-netlist skill's kit_netlist.py). */
export const kitCircuits: KitCircuit[] = Object.values(import.meta.glob<KitCircuit>("./circuits/*.json", { eager: true, import: "default" })).sort((a, b) => a.kitName.localeCompare(b.kitName));

const converted = kitCircuits.map((kit) => {
  try {
    return { kit, preset: kitToPreset(kit), reason: null };
  } catch (err) {
    if (err instanceof UnsupportedKitError) return { kit, preset: null, reason: err.message };
    throw err;
  }
});

/** Kit circuits the simulator can run, as loadable presets. */
export const kitPresets: PedalPreset[] = converted.flatMap((c) => (c.preset ? [c.preset] : []));

/** Kit circuits recorded but not yet simulatable, with the part that stops them. */
export const unsupportedKits: { kit: KitCircuit; reason: string }[] = converted.flatMap((c) => (c.reason ? [{ kit: c.kit, reason: c.reason }] : []));

export type { KitCircuit, KitMeta } from "./types";
