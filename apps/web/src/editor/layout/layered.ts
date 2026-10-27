/**
 * Generic layered-graph helpers (Sugiyama-style): BFS depth for columns, barycenter ordering for
 * rows. Used for both levels of the hierarchical layout - blocks within the circuit, and parts
 * within a block - so the two levels behave the same way.
 */

export type Adjacency = Map<string, Set<string>>;

/** BFS distance from `roots`; anything unreachable goes one column past the deepest. */
export function layerDepths(ids: string[], neighbors: Adjacency, roots: string[]): Map<string, number> {
  const depth = new Map<string, number>();
  const queue: string[] = [];
  for (const r of roots) {
    if (!ids.includes(r) || depth.has(r)) continue;
    depth.set(r, 0);
    queue.push(r);
  }
  if (queue.length === 0 && ids.length > 0) {
    depth.set(ids[0], 0);
    queue.push(ids[0]);
  }
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const next of neighbors.get(current) ?? []) {
      if (depth.has(next) || !ids.includes(next)) continue;
      depth.set(next, depth.get(current)! + 1);
      queue.push(next);
    }
  }
  const maxDepth = Math.max(0, ...depth.values());
  for (const id of ids) if (!depth.has(id)) depth.set(id, maxDepth + 1);
  return depth;
}

/**
 * Row within each column by the barycenter heuristic: repeatedly re-sort each column by the average
 * row of its neighbours, alternating sweep direction. Pulls connected items onto shared rows and
 * pushes unrelated branches apart, which is what cuts wire crossings.
 */
export function barycenterRows(ids: string[], depth: Map<string, number>, neighbors: Adjacency, initialOrder?: (a: string, b: string) => number): Map<string, number> {
  const byColumn = new Map<number, string[]>();
  for (const id of ids) {
    const c = depth.get(id) ?? 0;
    if (!byColumn.has(c)) byColumn.set(c, []);
    byColumn.get(c)!.push(id);
  }
  const columns = [...byColumn.keys()].sort((a, b) => a - b);
  const rowOf = new Map<string, number>();
  for (const c of columns) {
    const col = byColumn.get(c)!;
    if (initialOrder) col.sort(initialOrder);
    col.forEach((id, i) => rowOf.set(id, i));
  }
  for (let iter = 0; iter < 6; iter++) {
    const order = iter % 2 === 0 ? columns : [...columns].reverse();
    for (const c of order) {
      const col = byColumn.get(c)!;
      const bary = new Map<string, number>();
      for (const id of col) {
        const rows = [...(neighbors.get(id) ?? [])].map((n) => rowOf.get(n)).filter((r): r is number => r !== undefined);
        bary.set(id, rows.length > 0 ? rows.reduce((a, b) => a + b, 0) / rows.length : rowOf.get(id)!);
      }
      col.sort((a, b) => bary.get(a)! - bary.get(b)! || rowOf.get(a)! - rowOf.get(b)!);
      col.forEach((id, i) => rowOf.set(id, i));
    }
  }
  return rowOf;
}
