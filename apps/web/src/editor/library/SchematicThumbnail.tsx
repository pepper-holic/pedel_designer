import { useMemo } from "react";
import { buildCanvasEndpoints } from "../canvasEndpoints";
import { netlistFromGraph } from "../netlistFromGraph";
import { wireRoutes } from "../routing/wirePolylines";
import { symbolRect } from "../layout/metrics";
import { PartSymbol } from "../symbols";
import type { ThumbnailScene } from "./thumbnails";

/** World-space margin around the circuit inside the thumbnail. */
const PADDING = 24;

interface SchematicThumbnailProps {
  scene: ThumbnailScene;
  className?: string;
}

/**
 * A library item's circuit, drawn small: the real symbols and the real routed wires, fitted into
 * the box, with no labels (unreadable at this size) and 1px strokes whatever the scale (CSS
 * `vector-effect`, see library.css) so a dense fuzz and a two-part clipper read with the same line
 * weight. Decorative: the card's text names the item.
 */
export function SchematicThumbnail({ scene, className }: SchematicThumbnailProps) {
  const drawing = useMemo(() => {
    const { parts, wires, blocks } = scene;
    const g = netlistFromGraph(parts, wires);
    const netOf = (r: { partId: string; terminalId: string }) => g.terminalNet.get(`${r.partId}:${r.terminalId}`);
    const endpoints = buildCanvasEndpoints(parts, blocks, netOf);
    const routes = wireRoutes(wires, endpoints, parts, netOf);
    const xs: number[] = [];
    const ys: number[] = [];
    for (const p of parts) {
      const r = symbolRect(p);
      xs.push(r.x1, r.x2);
      ys.push(r.y1, r.y2);
    }
    for (const { points } of routes) for (const p of points) {
      xs.push(p.x);
      ys.push(p.y);
    }
    if (xs.length === 0) return null;
    const minX = Math.min(...xs) - PADDING;
    const minY = Math.min(...ys) - PADDING;
    const maxX = Math.max(...xs) + PADDING;
    const maxY = Math.max(...ys) + PADDING;
    return { routes, viewBox: `${minX} ${minY} ${maxX - minX} ${maxY - minY}` };
  }, [scene]);

  if (!drawing) return <svg className={className} aria-hidden="true" />;
  return (
    <svg className={className} viewBox={drawing.viewBox} preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">
      {drawing.routes.map(({ wire, points }) => (
        <polyline key={wire.id} points={points.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" />
      ))}
      {scene.parts.map((part) => (
        <g key={part.id} transform={`translate(${part.x},${part.y}) ${part.mirror ? `rotate(${part.rotation}) scale(1,-1)` : `rotate(${part.rotation})`}`}>
          <PartSymbol part={part} />
        </g>
      ))}
    </svg>
  );
}
