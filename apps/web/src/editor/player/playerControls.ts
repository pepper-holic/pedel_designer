import { SWITCH_POSITION_LABELS } from "../switchLabels";
import type { BlockCategory, BlockInstance, BlockParam, PartInstance } from "../types";

export interface PlayerControl {
  param: BlockParam;
  part: PartInstance;
  /** A continuous pot (0..1 position) or a switch with named positions. */
  kind: "knob" | "switch";
}

export interface PlayerSection {
  id: string;
  label: string;
  category: BlockCategory | null;
  controls: PlayerControl[];
}

function controlFor(param: BlockParam, part: PartInstance | undefined): PlayerControl | null {
  if (!part) return null;
  if (param.paramKey === "position" && typeof part.params.position === "number") return { param, part, kind: "knob" };
  if (param.paramKey === "switchPosition" && SWITCH_POSITION_LABELS[part.type]) return { param, part, kind: "switch" };
  return null;
}

/**
 * What the player's front panel shows: every knob and switch the blocks expose, section by
 * section in block order (the signal order the presets declare), then any pot or switch no block
 * claims - a hand-built circuit with no blocks still gets a playable panel. Exposed raw values (a
 * resistor's ohms) stay in the block inspector: they are engineering knobs, not pedal controls.
 */
export function playerSections(blocks: BlockInstance[], parts: PartInstance[]): PlayerSection[] {
  const byId = new Map(parts.map((p) => [p.id, p]));
  const claimed = new Set<string>();
  const sections: PlayerSection[] = [];
  for (const block of blocks) {
    const controls: PlayerControl[] = [];
    for (const param of block.params) {
      const control = controlFor(param, byId.get(param.partId));
      if (!control) continue;
      controls.push(control);
      claimed.add(`${param.partId}:${param.paramKey}`);
    }
    if (controls.length > 0) sections.push({ id: block.id, label: block.label, category: block.category, controls });
  }
  const loose: PlayerControl[] = [];
  for (const part of parts) {
    const paramKey = typeof part.params.position === "number" ? "position" : SWITCH_POSITION_LABELS[part.type] ? "switchPosition" : null;
    if (!paramKey || claimed.has(`${part.id}:${paramKey}`)) continue;
    const control = controlFor({ id: `loose-${part.id}`, label: part.id, partId: part.id, paramKey }, part);
    if (control) loose.push(control);
  }
  if (loose.length > 0) sections.push({ id: "loose", label: "기타 컨트롤", category: null, controls: loose });
  return sections;
}
