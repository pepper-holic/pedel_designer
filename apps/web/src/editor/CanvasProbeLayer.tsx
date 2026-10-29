import { useMemo } from "react";
import { formatVoltage, type OperatingPoint } from "./operatingPoint";
import { dcTagWidth, flagWidth, nearestEdgePoint, probeTagPlacements, type TagRequest } from "./layout/probeLabels";
import type { Rect } from "./layout/labels";
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
  /** What flags and tags must stay clear of: part bodies, drawn wires, the part labels. */
  occupied: Rect[];
  /** The drawn wires alone - a flag's leader line must not cut across one. */
  wireRects: Rect[];
}

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
 * and, optionally, the DC bias voltage of every node. Flags and tags are placed by the shared label
 * pass (layout/probeLabels.ts) so they sit clear of wires, parts, part labels and each other, each
 * flag tied to its pin by a short leader. Drawn above parts, with pointer events off so a marker
 * never steals the click that would remove or rewire it.
 */
export function CanvasProbeLayer({ parts, probes, terminalNet, operatingPoint, showAllDc, endpoints, occupied, wireRects }: CanvasProbeLayerProps) {
  const anchors = useMemo(() => (showAllDc ? netAnchors(parts, terminalNet, endpoints) : new Map<string, { x: number; y: number }>()), [showAllDc, parts, terminalNet, endpoints]);
  const probedNets = new Set(probes.map((p) => p.net));
  const dcOf = (net: string) => {
    const v = operatingPoint?.voltages.get(net);
    return v === undefined ? null : formatVoltage(v);
  };

  const flags = probes.flatMap((probe) => {
    const pos = endpoints.resolve(probe.terminal);
    if (!pos) return [];
    const dc = dcOf(probe.net);
    return [{ probe, pos, req: { id: `probe-${probe.id}`, text: dc ? `${probe.label} · ${dc}` : probe.label, anchor: pos } satisfies TagRequest }];
  });
  const dcTags = [...anchors].flatMap(([net, pos]) => {
    if (probedNets.has(net)) return []; // the probe flag already carries this net's voltage
    const text = dcOf(net);
    return text ? [{ net, req: { id: `dc-${net}`, text, anchor: pos } satisfies TagRequest }] : [];
  });
  const placed = probeTagPlacements(
    flags.map((f) => f.req),
    dcTags.map((t) => t.req),
    occupied,
    wireRects,
  );

  return (
    <g pointerEvents="none" fontFamily="var(--font-mono)" fontSize={10}>
      {dcTags.map(({ net, req }) => {
        const r = placed.get(req.id)!;
        return (
          <g key={req.id} transform={`translate(${r.x1},${r.y1})`} data-dc-net={net}>
            <rect width={dcTagWidth(req.text)} height={r.y2 - r.y1} rx={1} fill="var(--bg-raised)" stroke="var(--border)" strokeWidth={0.8} opacity={0.95} />
            <text x={3} y={10} fill="var(--text-dim)">
              {req.text}
            </text>
          </g>
        );
      })}

      {flags.map(({ probe, pos, req }) => {
        const r = placed.get(req.id)!;
        const tip = nearestEdgePoint(r, pos);
        return (
          <g key={probe.id} data-probe-id={probe.id}>
            <circle cx={pos.x} cy={pos.y} r={7} fill="none" stroke={probe.color} strokeWidth={2.5} />
            <line x1={pos.x} y1={pos.y} x2={tip.x} y2={tip.y} stroke={probe.color} strokeWidth={1.5} />
            <g transform={`translate(${r.x1},${r.y1})`}>
              <rect width={flagWidth(req.text)} height={r.y2 - r.y1} rx={1} fill="var(--bg-inset)" stroke={probe.color} strokeWidth={1.2} />
              <text x={4} y={11} fill="var(--text)" fontWeight={600}>
                {req.text}
              </text>
            </g>
          </g>
        );
      })}
    </g>
  );
}
