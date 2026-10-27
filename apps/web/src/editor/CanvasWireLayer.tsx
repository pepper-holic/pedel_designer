import { useMemo } from "react";
import { computeWirePaths } from "./geometry";
import type { CanvasEndpoints } from "./canvasEndpoints";
import type { TerminalRef, Wire } from "./types";

// Transparent click target width for wires - the visible stroke is only 2px, which is not a
// realistic mouse target on a dense schematic.
const WIRE_HITBOX_WIDTH = 12;

function terminalKey(ref: TerminalRef): string {
  return `${ref.partId}:${ref.terminalId}`;
}

interface CanvasWireLayerProps {
  endpoints: CanvasEndpoints;
  wires: Wire[];
  selectedWireId: string | null;
  onWireClick: (wire: Wire, e: React.MouseEvent) => void;
}

/** Every wire's visible stroke, its fat transparent hit-target, and the junction dots where 3+ wire
 * ends meet. Drawn after block regions and before parts, so terminals (wiring) still win over wire
 * selection where they overlap. */
export function CanvasWireLayer({ endpoints, wires, selectedWireId, onWireClick }: CanvasWireLayerProps) {
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

  // Resolved (wire, endpoints) pairs for wires whose parts still exist, plus the crossing-aware
  // path string for each - computed together in one pass so a hop on one wire accounts for every
  // other wire currently on the canvas.
  const resolvedWires = useMemo(() => {
    const withEndpoints = wires
      .map((wire) => {
        if (endpoints.isHiddenWire(wire)) return null;
        const a = endpoints.resolve(wire.a);
        const b = endpoints.resolve(wire.b);
        // Two ends that now land on the same pin (both on one port's net) would be a zero-length stub.
        if (!a || !b || (a.x === b.x && a.y === b.y)) return null;
        return { wire, a, b };
      })
      .filter((w): w is { wire: Wire; a: { x: number; y: number }; b: { x: number; y: number } } => w !== null);

    const paths = computeWirePaths(withEndpoints.map((w) => [w.a, w.b]));
    return withEndpoints.map((w, i) => ({ wire: w.wire, path: paths[i] }));
  }, [wires, endpoints]);

  return (
    <>
      {resolvedWires.map(({ wire, path }) => (
        <path
          key={wire.id}
          d={path}
          stroke={wire.id === selectedWireId ? "var(--accent)" : "var(--wire)"}
          strokeWidth={wire.id === selectedWireId ? 3 : 2}
          fill="none"
          pointerEvents="none"
        />
      ))}

      {/* Transparent fat overlay per wire: a 2px stroke is far too thin to click reliably, so
          selection hit-testing runs against this instead. */}
      {resolvedWires.map(({ wire, path }) => (
        <path
          key={`hit-${wire.id}`}
          data-wire-id={wire.id}
          d={path}
          stroke="transparent"
          strokeWidth={WIRE_HITBOX_WIDTH}
          fill="none"
          pointerEvents="stroke"
          style={{ cursor: "pointer" }}
          onClick={(e) => {
            e.stopPropagation();
            onWireClick(wire, e);
          }}
        />
      ))}

      {junctionPoints.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={3.5} fill="var(--wire)" />
      ))}
    </>
  );
}
