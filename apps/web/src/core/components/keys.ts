/**
 * Interned per-element state keys ("C1#i", "Q1:be"). The history and limiter maps are keyed by
 * string, and building those strings with a template literal allocates a new one on every stamp of
 * every Newton iteration of every sample - garbage the simulation loop does not need to make.
 */
const cache = new Map<string, Map<string, string>>();

export function stateKey(id: string, suffix: string): string {
  let bySuffix = cache.get(suffix);
  if (!bySuffix) {
    bySuffix = new Map();
    cache.set(suffix, bySuffix);
  }
  let key = bySuffix.get(id);
  if (key === undefined) {
    key = id + suffix;
    bySuffix.set(id, key);
  }
  return key;
}
