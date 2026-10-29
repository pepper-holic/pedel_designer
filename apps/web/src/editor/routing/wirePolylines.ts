import { polylineThrough, terminalPosition, type Point } from "../geometry";
import { PART_DEFS } from "../partDefs";
import { symbolRect } from "../layout/metrics";
import { routeJobs, type RouteContext, type RouteJob } from "./netRouter";
import type { CanvasEndpoints } from "../canvasEndpoints";
import type { PartInstance, TerminalRef, Wire } from "../types";

export interface WireRoute {
  wire: Wire;
  points: Point[];
}

/** Everything a wire must route around: visible part symbols (with their leads) and the boxes of
 * collapsed blocks, plus every visible pin with its net. */
function routeContext(parts: PartInstance[], endpoints: CanvasEndpoints, netOf: (ref: TerminalRef) => string | undefined): RouteContext {
  const visible = parts.filter((p) => !endpoints.hidden.has(p.id));
  const obstacles = visible.map((p) => ({ rect: symbolRect(p), ownerId: p.id }));
  for (const [blockId, l] of endpoints.layouts) obstacles.push({ rect: { x1: l.left, y1: l.top, x2: l.left + l.width, y2: l.top + l.height }, ownerId: blockId });
  const pins = visible.flatMap((p) => PART_DEFS[p.type].terminals.map((t) => ({ at: terminalPosition(p, t.id), net: netOf({ partId: p.id, terminalId: t.id }) })));
  for (const l of endpoints.layouts.values()) for (const pin of l.pins) pins.push({ at: { x: pin.x, y: pin.y }, net: netOf(pin.port.terminal) });
  return { obstacles, pins };
}

/**
 * Decides every visible wire's path: the user's waypoints when it has them, otherwise whatever the
 * router picks (routing/netRouter.ts) - a straight run, an L, a Z or a short detour, chosen to stay
 * out of part bodies and off other nets' wires and pins, leaving each pin along its own lead.
 */
export function wireRoutes(wires: Wire[], endpoints: CanvasEndpoints, parts: PartInstance[], netOf: (ref: TerminalRef) => string | undefined): WireRoute[] {
  const jobs: RouteJob[] = [];
  const byJob = new Map<string, Wire>();
  for (const wire of wires) {
    if (endpoints.isHiddenWire(wire)) continue;
    const a = endpoints.resolve(wire.a);
    const b = endpoints.resolve(wire.b);
    if (!a || !b || (a.x === b.x && a.y === b.y)) continue;
    const owner = (ref: TerminalRef) => endpoints.hidden.get(ref.partId)?.id ?? ref.partId;
    jobs.push({
      id: wire.id,
      net: netOf(wire.a) ?? wire.id,
      a: { at: a, lead: endpoints.leadOutward(wire.a) ?? undefined, ownerId: owner(wire.a) },
      b: { at: b, lead: endpoints.leadOutward(wire.b) ?? undefined, ownerId: owner(wire.b) },
      fixed: wire.waypoints?.length ? polylineThrough(a, wire.waypoints, b) : undefined,
    });
    byJob.set(wire.id, wire);
  }
  const routed = routeJobs(jobs, routeContext(parts, endpoints, netOf));
  return jobs.map((j) => ({ wire: byJob.get(j.id)!, points: routed.get(j.id)! }));
}
