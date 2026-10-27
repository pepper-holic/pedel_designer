import type { PartInstance, Probe, TerminalRef } from "./types";

/**
 * Probe colours: muted hues - just enough apart to tell overlaid curves from each other, quiet
 * enough not to compete with the grey schematic. Assigned in order and reused round-robin.
 */
export const PROBE_COLORS = ["#4a6fa5", "#b0694a", "#5b8a6f", "#8572a8", "#a85a72", "#71717a"];

/** More than this and the overlaid plots stop being readable - the user should drop one first. */
export const MAX_PROBES = 6;

export interface ResolvedProbe extends Probe {
  /** The net the probe's terminal sits on in the current circuit. */
  net: string;
}

function key(ref: TerminalRef): string {
  return `${ref.partId}:${ref.terminalId}`;
}

/**
 * Probes that still point at something measurable: their part exists and their terminal lands on a
 * real, non-ground net. Two probes on one net (possible after wiring two probed points together)
 * collapse to the first, since they would draw the identical curve twice.
 */
export function resolveProbes(probes: Probe[], parts: PartInstance[], terminalNet: Map<string, string>): ResolvedProbe[] {
  const partIds = new Set(parts.map((p) => p.id));
  const seenNets = new Set<string>();
  const resolved: ResolvedProbe[] = [];
  for (const probe of probes) {
    if (!partIds.has(probe.terminal.partId)) continue;
    const net = terminalNet.get(key(probe.terminal));
    if (!net || net === "0" || seenNets.has(net)) continue;
    seenNets.add(net);
    // A probe saved under an older palette is drawn in the current one.
    const color = PROBE_COLORS.includes(probe.color) ? probe.color : PROBE_COLORS[resolved.length % PROBE_COLORS.length];
    resolved.push({ ...probe, net, color });
  }
  return resolved;
}

/**
 * Probe-mode click on a terminal: removes the probe already measuring that net, or adds a new one.
 * Toggling by net (not by exact terminal) is what makes a second click anywhere on the same node
 * undo the first, which is how people expect a probe tool to behave.
 */
export function toggleProbe(probes: Probe[], terminal: TerminalRef, terminalNet: Map<string, string>): Probe[] {
  const net = terminalNet.get(key(terminal));
  if (!net || net === "0") return probes;
  const existing = probes.find((p) => terminalNet.get(key(p.terminal)) === net);
  if (existing) return probes.filter((p) => p.id !== existing.id);
  if (probes.length >= MAX_PROBES) return probes;

  const usedColors = new Set(probes.map((p) => p.color));
  const color = PROBE_COLORS.find((c) => !usedColors.has(c)) ?? PROBE_COLORS[probes.length % PROBE_COLORS.length];
  let n = 1;
  const usedIds = new Set(probes.map((p) => p.id));
  while (usedIds.has(`P${n}`)) n++;
  return [...probes, { id: `P${n}`, terminal: { ...terminal }, label: `P${n}`, color }];
}

/** Drops probes whose part no longer exists - run when parts are deleted so stale probes don't
 * linger in the saved circuit. */
export function pruneProbes(probes: Probe[], parts: PartInstance[]): Probe[] {
  const partIds = new Set(parts.map((p) => p.id));
  const kept = probes.filter((p) => partIds.has(p.terminal.partId));
  return kept.length === probes.length ? probes : kept;
}
