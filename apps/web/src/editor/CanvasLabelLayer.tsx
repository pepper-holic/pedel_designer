import { useMemo } from "react";
import { partLabelPlacements } from "./layout/partLabels";
import type { CanvasEndpoints } from "./canvasEndpoints";
import type { PartInstance, Wire } from "./types";

interface CanvasLabelLayerProps {
  parts: PartInstance[];
  wires: Wire[];
  endpoints: CanvasEndpoints;
}

/**
 * Every part's id and value label, placed by a shared greedy pass (layout/partLabels.ts,
 * layout/labels.ts) so they avoid wires, part bodies and each other instead of always sitting at a
 * fixed offset - see docs/plan-schematic-layout.md L4. Drawn as its own layer above the parts
 * (rather than inline per part) so a label is never hidden under a later part, and so placement has
 * every obstacle in view at once.
 */
export function CanvasLabelLayer({ parts, wires, endpoints }: CanvasLabelLayerProps) {
  const { requests, placed } = useMemo(() => partLabelPlacements(parts, wires, endpoints), [parts, wires, endpoints]);

  return (
    <g pointerEvents="none" fontFamily="var(--font-mono)" fontSize={10}>
      {requests.map((req) => {
        const r = placed.get(req.id)!;
        return (
          <g key={req.id}>
            <rect x={r.x1} y={r.y1} width={r.x2 - r.x1} height={r.y2 - r.y1} fill="var(--bg-inset)" opacity={0.85} />
            <text x={(r.x1 + r.x2) / 2} y={r.y1 + 9} textAnchor="middle" fill="var(--text-dim)">
              {req.text}
            </text>
          </g>
        );
      })}
    </g>
  );
}
