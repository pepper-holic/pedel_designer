import { laneOffsetFor, orthogonalPoints, polylineThrough, type Point } from "../geometry";
import { bodyRect } from "../layout/metrics";
import { routeWires, type Rect, type RouteRequest } from "./astar";
import type { CanvasEndpoints } from "../canvasEndpoints";
import type { PartInstance, TerminalRef, Wire } from "../types";

export interface WireRoute {
  wire: Wire;
  points: Point[];
}

/**
 * Decides every visible wire's path: the user's waypoints when it has them, otherwise the
 * obstacle-avoiding router - or, while something is being dragged (`fast`), the plain 2-bend route,
 * so dragging stays smooth on a big circuit and the proper route settles when the mouse is let go.
 */
export function wireRoutes(
  wires: Wire[],
  parts: PartInstance[],
  endpoints: CanvasEndpoints,
  netOf: (ref: TerminalRef) => string | undefined,
  fast: boolean,
): WireRoute[] {
  const visible = wires
    .map((wire, index) => {
      if (endpoints.isHiddenWire(wire)) return null;
      const a = endpoints.resolve(wire.a);
      const b = endpoints.resolve(wire.b);
      if (!a || !b || (a.x === b.x && a.y === b.y)) return null;
      return { wire, index, a, b };
    })
    .filter((w): w is { wire: Wire; index: number; a: Point; b: Point } => w !== null);

  const routed = new Map<string, Point[]>();
  const toRoute = visible.filter((v) => !v.wire.waypoints?.length);
  if (!fast && toRoute.length > 0) {
    const obstacles: Rect[] = [
      ...parts.filter((p) => p.type !== "ground" && !endpoints.hidden.has(p.id)).map(bodyRect),
      ...[...endpoints.layouts.values()].map((l) => ({ x1: l.left - 2, y1: l.top - 2, x2: l.left + l.width + 2, y2: l.top + l.height + 2 })),
    ];
    const requests: RouteRequest[] = toRoute.map((v) => ({ a: v.a, b: v.b, net: netOf(v.wire.a) ?? v.wire.id }));
    routeWires(requests, obstacles).forEach((pts, i) => {
      if (pts) routed.set(toRoute[i].wire.id, pts);
    });
  }

  return visible.map(({ wire, index, a, b }) => ({
    wire,
    points: wire.waypoints?.length ? polylineThrough(a, wire.waypoints, b) : (routed.get(wire.id) ?? orthogonalPoints(a, b, laneOffsetFor(index))),
  }));
}
