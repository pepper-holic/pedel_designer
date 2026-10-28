import { useMemo } from "react";
import { draggableCorners, renderWirePaths, type Point } from "./geometry";
import { wireRoutes } from "./routing/wirePolylines";
import type { CanvasEndpoints } from "./canvasEndpoints";
import type { TerminalRef, Wire } from "./types";

// Transparent click target width for wires - the visible stroke is only 2px, which is not a
// realistic mouse target on a dense schematic.
const WIRE_HITBOX_WIDTH = 12;
const HANDLE_SIZE = 9;

function terminalKey(ref: TerminalRef): string {
  return `${ref.partId}:${ref.terminalId}`;
}

interface CanvasWireLayerProps {
  endpoints: CanvasEndpoints;
  wires: Wire[];
  selectedWireId: string | null;
  onWireClick: (wire: Wire, e: React.MouseEvent) => void;
  /** Mouse down on a selected wire's segment handle - starts a segment drag. */
  onSegmentMouseDown?: (wire: Wire, corners: Point[], segment: number, e: React.MouseEvent) => void;
  /** Double-click anywhere on a wire - splits the nearest segment into a new draggable corner. */
  onWireDoubleClick?: (wire: Wire, corners: Point[], e: React.MouseEvent) => void;
}

/** Every wire's visible stroke, its fat transparent hit-target, the junction dots where 3+ wire
 * ends meet, and - on the selected wire - handles to drag its segments. Drawn after block regions
 * and before parts, so terminals (wiring) still win over wire selection where they overlap. */
export function CanvasWireLayer({ endpoints, wires, selectedWireId, onWireClick, onSegmentMouseDown, onWireDoubleClick }: CanvasWireLayerProps) {
  // A junction dot is drawn wherever 3+ wire ends meet at the same terminal - a real electrical
  // junction, as opposed to a plain 2-wire pass-through or two wires merely crossing visually.
  const junctionPoints = useMemo(() => {
    const counts = new Map<string, number>();
    for (const wire of wires) {
      if (endpoints.isHiddenWire(wire)) continue;
      counts.set(terminalKey(wire.a), (counts.get(terminalKey(wire.a)) ?? 0) + 1);
      counts.set(terminalKey(wire.b), (counts.get(terminalKey(wire.b)) ?? 0) + 1);
    }
    const points: { x: number; y: number }[] = [];
    for (const [key, count] of counts) {
      if (count < 3) continue;
      const [partId, terminalId] = key.split(":");
      // A junction inside a collapsed block is not visible - the box stands for it.
      if (endpoints.hidden.has(partId)) continue;
      const p = endpoints.resolve({ partId, terminalId });
      if (p) points.push(p);
    }
    return points;
  }, [wires, endpoints]);

  const routes = useMemo(() => wireRoutes(wires, endpoints), [wires, endpoints]);
  const paths = useMemo(() => renderWirePaths(routes.map((r) => r.points)), [routes]);
  const selected = routes.find((r) => r.wire.id === selectedWireId);

  return (
    <>
      {routes.map(({ wire }, i) => (
        <path
          key={wire.id}
          d={paths[i]}
          stroke={wire.id === selectedWireId ? "var(--select)" : "var(--wire)"}
          strokeWidth={wire.id === selectedWireId ? 3 : 2}
          fill="none"
          pointerEvents="none"
        />
      ))}

      {/* Transparent fat overlay per wire: a 2px stroke is far too thin to click reliably, so
          selection hit-testing runs against this instead. */}
      {routes.map(({ wire, points }, i) => (
        <path
          key={`hit-${wire.id}`}
          data-wire-id={wire.id}
          d={paths[i]}
          stroke="transparent"
          strokeWidth={WIRE_HITBOX_WIDTH}
          fill="none"
          pointerEvents="stroke"
          style={{ cursor: "pointer" }}
          onClick={(e) => {
            e.stopPropagation();
            onWireClick(wire, e);
          }}
          onDoubleClick={(e) => {
            e.stopPropagation();
            onWireDoubleClick?.(wire, points, e);
          }}
        >
          <title>더블클릭으로 꺾는점 추가</title>
        </path>
      ))}

      {junctionPoints.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={3.5} fill="var(--wire)" />
      ))}

      {selected &&
        onSegmentMouseDown &&
        (() => {
          const corners = draggableCorners(selected.points);
          return corners.slice(1, -2).map((p, k) => {
            const q = corners[k + 2];
            const horizontal = p.y === q.y;
            return (
              <rect
                key={`seg-${k}`}
                data-segment-handle={k + 1}
                x={(p.x + q.x) / 2 - HANDLE_SIZE / 2}
                y={(p.y + q.y) / 2 - HANDLE_SIZE / 2}
                width={HANDLE_SIZE}
                height={HANDLE_SIZE}
                rx={2}
                fill="var(--bg-inset)"
                stroke="var(--select)"
                strokeWidth={2}
                style={{ cursor: horizontal ? "ns-resize" : "ew-resize" }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  onSegmentMouseDown(selected.wire, corners, k + 1, e);
                }}
              >
                <title>끌어서 배선 경로 옮기기</title>
              </rect>
            );
          });
        })()}
    </>
  );
}
