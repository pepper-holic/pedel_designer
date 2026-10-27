import { netlistFromGraph } from "../netlistFromGraph";
import { terminalPosition } from "../geometry";
import type { CircuitSnapshot } from "../historyStack";
import type { TerminalRef, Wire } from "../types";

/**
 * Replaces every (non-ground) net's wires with the shortest tree that connects its terminals
 * (Prim's algorithm on Manhattan distance). Electrically identical - same terminals, same nets -
 * but after parts move, the old wires can criss-cross the sheet joining terminals that are no longer
 * neighbours. Ground keeps its wires: each grounded terminal already runs to its own local symbol.
 */
export function rewireNets(snapshot: CircuitSnapshot): CircuitSnapshot {
  const { terminalNet } = netlistFromGraph(snapshot.parts, snapshot.wires);
  const byId = new Map(snapshot.parts.map((p) => [p.id, p]));
  const wiredKeys = new Set(snapshot.wires.flatMap((w) => [`${w.a.partId}:${w.a.terminalId}`, `${w.b.partId}:${w.b.terminalId}`]));

  // Only terminals that were wired before take part - an unconnected terminal that happens to share
  // nothing with anyone stays unconnected (DRC reports those; rewiring must not paper over them).
  const terminalsByNet = new Map<string, TerminalRef[]>();
  for (const key of wiredKeys) {
    const net = terminalNet.get(key);
    if (!net || net === "0") continue;
    const [partId, terminalId] = key.split(":");
    if (!byId.has(partId)) continue;
    if (!terminalsByNet.has(net)) terminalsByNet.set(net, []);
    terminalsByNet.get(net)!.push({ partId, terminalId });
  }

  const groundWires = snapshot.wires.filter((w) => terminalNet.get(`${w.a.partId}:${w.a.terminalId}`) === "0");
  const wires: Wire[] = [...groundWires];
  let n = 0;
  const nextId = () => {
    const taken = new Set(wires.map((w) => w.id));
    while (taken.has(`rw${n}`)) n++;
    return `rw${n++}`;
  };

  for (const refs of terminalsByNet.values()) {
    if (refs.length < 2) continue;
    const pos = refs.map((r) => terminalPosition(byId.get(r.partId)!, r.terminalId));
    const inTree = new Array(refs.length).fill(false);
    const best = new Array(refs.length).fill(Infinity);
    const from = new Array(refs.length).fill(-1);
    best[0] = 0;
    for (let k = 0; k < refs.length; k++) {
      let u = -1;
      for (let i = 0; i < refs.length; i++) if (!inTree[i] && (u < 0 || best[i] < best[u])) u = i;
      inTree[u] = true;
      if (from[u] >= 0) wires.push({ id: nextId(), a: { ...refs[from[u]] }, b: { ...refs[u] } });
      for (let i = 0; i < refs.length; i++) {
        if (inTree[i]) continue;
        const d = Math.abs(pos[u].x - pos[i].x) + Math.abs(pos[u].y - pos[i].y);
        if (d < best[i]) {
          best[i] = d;
          from[i] = u;
        }
      }
    }
  }
  return { ...snapshot, wires };
}
