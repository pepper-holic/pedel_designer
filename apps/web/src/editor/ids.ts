/**
 * The first `${prefix}${n}` not already taken. Ids used to come from module-level counters, which
 * restart at 1 on every page load - so after reopening a saved circuit a new "resistor1" or "blk1"
 * could collide with an existing one and two parts would share wires and inspector state.
 */
export function nextFreeId(prefix: string, taken: Iterable<string>, start = 1): string {
  const used = new Set(taken);
  let n = start;
  while (used.has(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}
