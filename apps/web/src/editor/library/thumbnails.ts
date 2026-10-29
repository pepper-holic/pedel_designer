import { loadPedalPreset } from "../templateLoading";
import { instantiateBlock } from "../blockInstance";
import type { PedalPreset, PresetVariant } from "../../core/library/presets";
import type { WiringPreset } from "../wiring";
import type { BlockDef } from "../blocks";
import type { UserBlock } from "../userBlocks";
import type { BlockInstance, PartInstance, Wire } from "../types";

/** What a library thumbnail draws: the circuit exactly as loading the item would place it. */
export interface ThumbnailScene {
  parts: PartInstance[];
  wires: Wire[];
  blocks: BlockInstance[];
}

/** Laying a preset out (placement, orientation, routing) is the expensive part and the result never
 * changes for a given item, so every scene is built once per session and kept. */
const cache = new Map<string, ThumbnailScene>();

function remember(key: string, build: () => ThumbnailScene): ThumbnailScene {
  const hit = cache.get(key);
  if (hit) return hit;
  const scene = build();
  cache.set(key, scene);
  return scene;
}

export function presetScene(preset: PedalPreset, variant?: PresetVariant): ThumbnailScene {
  return remember(`preset:${preset.id}:${variant?.id ?? ""}`, () => loadPedalPreset(preset, variant).snapshot);
}

export function wiringScene(preset: WiringPreset): ThumbnailScene {
  return remember(`wiring:${preset.id}`, () => preset.snapshot);
}

export function blockScene(def: BlockDef): ThumbnailScene {
  return remember(`block:${def.id}`, () => {
    const placed = instantiateBlock(def, "thumb", { x: 100, y: 100 });
    return { parts: placed.parts, wires: placed.wires, blocks: [placed.block] };
  });
}

export function userBlockScene(block: UserBlock): ThumbnailScene {
  return remember(`user:${block.id}:${block.savedAt}`, () => ({ parts: block.parts, wires: block.wires, blocks: [] }));
}
