import { laneOffsetFor, orthogonalPoints, polylineThrough, terminalLeadAxis, type Point } from "../geometry";
import { bodyRect } from "../layout/metrics";
import { routeWires, type Rect, type RouteRequest } from "./astar";
import type { CanvasEndpoints } from "../canvasEndpoints";
import type { PartInstance, TerminalRef, Wire } from "../types";

export interface WireRoute {
  wire: Wire;
  points: Point[];
}

/**
 * While a part is being dragged: `movingIds` is who's actually moving (that part, or its whole
 * multi-selection, or every member of a block being dragged by its collapsed box) and `settled` is
 * the last properly-routed shape of every wire, from just before the drag started.
 */
export interface DragRouting {
  movingIds: ReadonlySet<string>;
  settled: ReadonlyMap<string, Point[]>;
}

/**
 * Decides every visible wire's path: the user's waypoints when it has them, otherwise the
 * obstacle-avoiding router - or, for a wire actually touching what's being dragged (`drag`), the
 * plain 2-bend route, so that one wire stays smooth while it's moving. Every OTHER wire keeps
 * exactly the shape `drag.settled` recorded, instead of the whole schematic flattening to the cheap
 * route just because one part elsewhere is moving; the proper route resettles for everyone once the
 * drag ends and `drag` goes back to `null`.
 */
export function wireRoutes(wires: Wire[], parts: PartInstance[], endpoints: CanvasEndpoints, netOf: (ref: TerminalRef) => string | undefined, drag: DragRouting | null): WireRoute[] {
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
  if (!drag && toRoute.length > 0) {
    const obstacles: Rect[] = [
      ...parts.filter((p) => p.type !== "ground" && !endpoints.hidden.has(p.id)).map(bodyRect),
      ...[...endpoints.layouts.values()].map((l) => ({ x1: l.left - 2, y1: l.top - 2, x2: l.left + l.width + 2, y2: l.top + l.height + 2 })),
    ];
    const byId = new Map(parts.map((p) => [p.id, p]));
    // A plain (uncollapsed) terminal's own lead axis - undefined for a collapsed block's pin, which
    // has no single part to take it from.
    const leadAxis = (ref: TerminalRef) => {
      const part = !endpoints.hidden.has(ref.partId) ? byId.get(ref.partId) : undefined;
      return part ? terminalLeadAxis(part, ref.terminalId) : undefined;
    };
    const requests: RouteRequest[] = toRoute.map((v) => ({ a: v.a, b: v.b, net: netOf(v.wire.a) ?? v.wire.id, axisA: leadAxis(v.wire.a), axisB: leadAxis(v.wire.b) }));
    routeWires(requests, obstacles).forEach((pts, i) => {
      if (pts) routed.set(toRoute[i].wire.id, pts);
    });
  }

  return visible.map(({ wire, index, a, b }) => {
    if (wire.waypoints?.length) return { wire, points: polylineThrough(a, wire.waypoints, b) };
    if (drag) {
      const touchesMoving = drag.movingIds.has(wire.a.partId) || drag.movingIds.has(wire.b.partId);
      const cached = !touchesMoving ? drag.settled.get(wire.id) : undefined;
      return { wire, points: cached ?? orthogonalPoints(a, b, laneOffsetFor(index)) };
    }
    return { wire, points: routed.get(wire.id) ?? orthogonalPoints(a, b, laneOffsetFor(index)) };
  });
}
