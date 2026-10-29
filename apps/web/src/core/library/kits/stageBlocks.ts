import type { Element } from "../../solver/types";
import type { BlockAnnotation, BlockCategory, PortSpec } from "../types";
import type { KitStage } from "./types";

const CATEGORIES: ReadonlySet<string> = new Set(["input", "buffer", "gain", "clipping", "fuzz", "tone", "output", "power", "load", "custom"]);
const GROUND = "0";

/**
 * Turn a kit's stages into block annotations. Ports are worked out from the netlist: "in"/"out"/"vcc"
 * become the block's input, output and supply; any other node a stage shares with another stage is an
 * input when the other stage comes earlier in signal order and an output when it comes later. The
 * supply source joins the power stage (created if the kit has none) and the amp-input load joins the
 * last output stage, so every element but the audio input sits in exactly one block.
 */
export function stageBlocks(stages: KitStage[], elementsByRef: Map<string, Element[]>, allElements: Element[]): BlockAnnotation[] {
  if (stages.length === 0) return [];
  const members = stages.map((st) => st.parts.flatMap((ref) => (elementsByRef.get(ref) ?? []).map((e) => e.id)));
  const byId = new Map(allElements.map((e) => [e.id, e]));

  let powerIndex = stages.findIndex((st) => st.category === "power");
  const list = stages.map((st, i) => ({ ...st, elements: members[i] }));
  if (powerIndex < 0) {
    list.push({ id: "power", category: "power", label: "전원", parts: [], elements: [] });
    powerIndex = list.length - 1;
  }
  list[powerIndex].elements = ["Vcc", ...list[powerIndex].elements];
  const outputIndex = list.map((st) => st.category).lastIndexOf("output");
  list[outputIndex >= 0 ? outputIndex : list.length - 1].elements.push("RLOAD");

  const nodesOf = list.map((st) => new Set(st.elements.flatMap((id) => byId.get(id)?.nodes ?? [])));
  return list.map((st, i): BlockAnnotation => {
    const ports: PortSpec[] = [];
    for (const node of nodesOf[i]) {
      if (node === GROUND) continue;
      if (node === "in") ports.push({ kind: "in", node });
      else if (node === "out") ports.push({ kind: "out", node });
      else if (node === "vcc") ports.push({ kind: "supply", node, label: i === powerIndex ? "9V" : "V+" });
      else {
        const sharers = nodesOf.flatMap((ns, j) => (j !== i && j !== powerIndex && ns.has(node) ? [j] : []));
        if (sharers.length === 0) continue;
        ports.push({ kind: sharers.some((j) => j < i) ? "in" : "out", node });
      }
    }
    const category = (CATEGORIES.has(st.category) ? st.category : "custom") as BlockCategory;
    return { id: st.id, label: st.label, category, elements: st.elements, ports };
  });
}
