import type { Element } from "../../solver/types";

/** Leakage given to a capacitor that walls off a DC island: far above any resistor on a pedal board,
 * so it sets only the island's resting voltage and leaves the audio response alone. */
export const ISLAND_LEAKAGE = 1e9;

/** Nodes each element ties together at DC. An op-amp's output is driven, so it counts as tied to
 * ground; its inputs draw no current and tie nothing. Capacitors are open. */
function dcLinks(el: Element): string[][] {
  switch (el.type) {
    case "capacitor":
      return [];
    case "opamp":
      return [[el.nodes[2], "0"]];
    case "coupledInductors":
      return [[el.nodes[0], el.nodes[1]], [el.nodes[2], el.nodes[3]]];
    default:
      return [[...el.nodes]];
  }
}

/**
 * A board can leave a node group reachable only through capacitors (a tone pot between a 22uF and a
 * 100n, say). The real circuit rests there on leakage; the solver has no DC solution. Give every
 * capacitor touching such a group a large parallel leakage, so the group rests between its neighbours.
 */
export function withIslandLeakage(elements: Element[]): Element[] {
  const parent = new Map<string, string>();
  const find = (n: string): string => {
    const p = parent.get(n) ?? n;
    if (p === n) return n;
    const root = find(p);
    parent.set(n, root);
    return root;
  };
  for (const el of elements) {
    for (const node of el.nodes) if (!parent.has(node)) parent.set(node, node);
    for (const [first, ...rest] of dcLinks(el)) for (const node of rest) parent.set(find(node), find(first));
  }
  const ground = find("0");
  const floating = (node: string): boolean => find(node) !== ground;
  return elements.map((el) => (el.type === "capacitor" && el.nodes.some(floating) ? { ...el, leakage: ISLAND_LEAKAGE } : el));
}
