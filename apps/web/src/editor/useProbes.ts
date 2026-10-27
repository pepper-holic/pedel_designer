import { useMemo, useState } from "react";
import { resolveProbes, toggleProbe, MAX_PROBES } from "./probes";
import type { GraphNetlist } from "./netlistFromGraph";
import type { PartInstance, Probe, TerminalRef } from "./types";

/**
 * The editor's probe set and probe mode. Probes live outside the undo history on purpose: they are
 * a view onto the circuit (like the chosen output node), not part of it, and undoing a wire edit
 * should not also make a probe vanish.
 */
export function useProbes(initial: Probe[], parts: PartInstance[], graph: GraphNetlist, onStatus: (message: string) => void) {
  const [probes, setProbes] = useState<Probe[]>(initial);
  const [probeMode, setProbeMode] = useState(false);

  const resolved = useMemo(() => resolveProbes(probes, parts, graph.terminalNet), [probes, parts, graph]);

  const toggleAt = (terminal: TerminalRef) => {
    const next = toggleProbe(probes, terminal, graph.terminalNet);
    if (next === probes) {
      const net = graph.terminalNet.get(`${terminal.partId}:${terminal.terminalId}`);
      if (net === "0") onStatus("접지(0V)에는 프로브를 둘 수 없습니다 - 기준점이라 항상 0입니다.");
      else if (probes.length >= MAX_PROBES) onStatus(`프로브는 최대 ${MAX_PROBES}개까지입니다. 기존 프로브를 하나 지운 뒤 추가하세요.`);
      return;
    }
    setProbes(next);
  };

  return {
    probes,
    resolved,
    probeMode,
    setProbeMode,
    toggleAt,
    remove: (id: string) => setProbes((ps) => ps.filter((p) => p.id !== id)),
    rename: (id: string, label: string) => setProbes((ps) => ps.map((p) => (p.id === id ? { ...p, label } : p))),
    /** Replaces the whole set - used when a circuit is loaded, since old probes point at old parts. */
    replaceAll: setProbes,
  };
}
