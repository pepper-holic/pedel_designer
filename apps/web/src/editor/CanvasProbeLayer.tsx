import { useMemo } from "react";
import { formatVoltage, type OperatingPoint } from "./operatingPoint";
import type { ResolvedProbe } from "./probes";
import type { CanvasEndpoints } from "./canvasEndpoints";
import type { PartInstance } from "./types";

interface CanvasProbeLayerProps {
  parts: PartInstance[];
  probes: ResolvedProbe[];
  terminalNet: Map<string, string>;
  /** When set, every net gets its DC bias voltage drawn next to one of its terminals. */
  operatingPoint: OperatingPoint | null;
  showAllDc: boolean;
  endpoints: CanvasEndpoints;
}

const FLAG_HEIGHT = 15;
const CHAR_WIDTH = 6.4;

/** One representative on-canvas point per net: the first terminal found on a non-ground part, so
 * the voltage label sits where the node is, not on a ground symbol. */
function netAnchors(parts: PartInstance[], terminalNet: Map<string, string>, endpoints: CanvasEndpoints): Map<string, { x: number; y: number }> {
  const byId = new Map(parts.map((p) => [p.id, p]));
  const anchors = new Map<string, { x: number; y: number }>();
  for (const [terminalKey, net] of terminalNet) {
    if (net === "0" || anchors.has(net)) continue;
    const [partId, terminalId] = terminalKey.split(":");
    const part = byId.get(partId);
    // Nodes inside a collapsed block have no visible place to put a label.
    if (!part || part.type === "ground" || endpoints.hidden.has(part.id)) continue;
    anchors.set(net, endpoints.resolve({ partId, terminalId })!);
  }
  return anchors;
}

/**
 * Probe markers (a coloured ring on the probed terminal plus a flag with its name and DC voltage)
 * and, optionally, the DC bias voltage of every node. Drawn above parts, with pointer events off so
 * a marker never steals the click that would remove or rewire it.
 */
export function CanvasProbeLayer({ parts, probes, terminalNet, operatingPoint, showAllDc, endpoints }: CanvasProbeLayerProps) {
  const anchors = useMemo(() => (showAllDc ? netAnchors(parts, terminalNet, endpoints) : new Map()), [showAllDc, parts, terminalNet, endpoints]);
  const probedNets = new Set(probes.map((p) => p.net));
  const dcOf = (net: string) => {
    const v = operatingPoint?.voltages.get(net);
    return v === undefined ? null : formatVoltage(v);
  };

  return (
    <g pointerEvents="none" fontFamily="var(--font-mono)" fontSize={10}>
      {showAllDc &&
        [...anchors].map(([net, pos]) => {
          if (probedNets.has(net)) return null; // the probe flag already carries this net's voltage
          const text = dcOf(net);
          if (!text) return null;
          const w = text.length * CHAR_WIDTH + 6;
          return (
            <g key={`dc-${net}`} transform={`translate(${pos.x + 6},${pos.y + 6})`} data-dc-net={net}>
              <rect width={w} height={13} rx={3} fill="var(--bg-raised)" stroke="var(--border)" strokeWidth={0.8} opacity={0.95} />
              <text x={3} y={10} fill="var(--text-dim)">
                {text}
              </text>
            </g>
          );
        })}

      {probes.map((probe) => {
        const pos = endpoints.resolve(probe.terminal);
        if (!pos) return null;
        const dc = dcOf(probe.net);
        const text = dc ? `${probe.label} · ${dc}` : probe.label;
        const w = text.length * CHAR_WIDTH + 8;
        return (
          <g key={probe.id} data-probe-id={probe.id}>
            <circle cx={pos.x} cy={pos.y} r={7} fill="none" stroke={probe.color} strokeWidth={2.5} />
            <line x1={pos.x + 5} y1={pos.y - 5} x2={pos.x + 12} y2={pos.y - 14} stroke={probe.color} strokeWidth={1.5} />
            <g transform={`translate(${pos.x + 12},${pos.y - 14 - FLAG_HEIGHT})`}>
              <rect width={w} height={FLAG_HEIGHT} rx={3} fill="var(--bg-inset)" stroke={probe.color} strokeWidth={1.2} />
              <text x={4} y={11} fill="var(--text)" fontWeight={600}>
                {text}
              </text>
            </g>
          </g>
        );
      })}
    </g>
  );
}
