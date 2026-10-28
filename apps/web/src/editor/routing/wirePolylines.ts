import { polylineThrough, singleBendPoints, type Point } from "../geometry";
import type { CanvasEndpoints } from "../canvasEndpoints";
import type { Wire } from "../types";

export interface WireRoute {
  wire: Wire;
  points: Point[];
}

/** Decides every visible wire's path: the user's waypoints when it has them, otherwise a straight
 * run or a single clean bend between its two endpoints - bending along each end's own lead axis so
 * the wire leaves (or arrives at) a pin with a short straight stub rather than turning right at it. */
export function wireRoutes(wires: Wire[], endpoints: CanvasEndpoints): WireRoute[] {
  const visible = wires
    .map((wire) => {
      if (endpoints.isHiddenWire(wire)) return null;
      const a = endpoints.resolve(wire.a);
      const b = endpoints.resolve(wire.b);
      if (!a || !b || (a.x === b.x && a.y === b.y)) return null;
      return { wire, a, b };
    })
    .filter((w): w is { wire: Wire; a: Point; b: Point } => w !== null);

  return visible.map(({ wire, a, b }) => {
    if (wire.waypoints?.length) return { wire, points: polylineThrough(a, wire.waypoints, b) };
    return { wire, points: singleBendPoints(a, b, endpoints.leadOutward(wire.a) ?? undefined, endpoints.leadOutward(wire.b) ?? undefined) };
  });
}
