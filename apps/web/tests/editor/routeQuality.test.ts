import { describe, expect, it } from "vitest";
import { wireRoutes } from "../../src/editor/routing/wirePolylines";
import { partLabelPlacements } from "../../src/editor/layout/partLabels";
import { probeTagPlacements } from "../../src/editor/layout/probeLabels";
import { rectsOverlap, type Rect } from "../../src/editor/layout/labels";
import { symbolRect } from "../../src/editor/layout/metrics";
import { buildCanvasEndpoints } from "../../src/editor/canvasEndpoints";
import { terminalPosition, type Point } from "../../src/editor/geometry";
import { loadPedalPreset } from "../../src/editor/templateLoading";
import { netlistFromGraph } from "../../src/editor/netlistFromGraph";
import { resolveProbes } from "../../src/editor/probes";
import { PART_DEFS } from "../../src/editor/partDefs";
import { presets } from "../../src/core/library/presets";

interface Seg {
  a: Point;
  b: Point;
  net: string;
  wireId: string;
}

function hitsRect(a: Point, b: Point, r: Rect): boolean {
  if (a.y === b.y) return a.y > r.y1 && a.y < r.y2 && Math.max(a.x, b.x) > r.x1 && Math.min(a.x, b.x) < r.x2;
  return a.x > r.x1 && a.x < r.x2 && Math.max(a.y, b.y) > r.y1 && Math.min(a.y, b.y) < r.y2;
}

/** Everything a reader would call a drawing defect in one preset's schematic. */
function defects(presetId: string) {
  const preset = presets.find((p) => p.id === presetId)!;
  const { snapshot, probes } = loadPedalPreset(preset);
  const g = netlistFromGraph(snapshot.parts, snapshot.wires);
  const netOf = (r: { partId: string; terminalId: string }) => g.terminalNet.get(`${r.partId}:${r.terminalId}`);
  const endpoints = buildCanvasEndpoints(snapshot.parts, snapshot.blocks, netOf);
  const routes = wireRoutes(snapshot.wires, endpoints, snapshot.parts, netOf);
  const segs: Seg[] = routes.flatMap((r) => r.points.slice(1).map((b, i) => ({ a: r.points[i], b, net: netOf(r.wire.a) ?? r.wire.id, wireId: r.wire.id })));

  // A wire leg through a part it does not end at.
  let bodyHits = 0;
  const detail: string[] = [];
  for (const s of segs) {
    const w = snapshot.wires.find((x) => x.id === s.wireId)!;
    for (const p of snapshot.parts) {
      if (p.id === w.a.partId || p.id === w.b.partId) continue;
      if (hitsRect(s.a, s.b, symbolRect(p))) {
        bodyHits++;
        detail.push(`wire ${w.a.partId}:${w.a.terminalId}-${w.b.partId}:${w.b.terminalId} through ${p.id}`);
      }
    }
  }
  // A wire leg through another net's pin.
  let pinHits = 0;
  for (const s of segs)
    for (const p of snapshot.parts)
      for (const t of PART_DEFS[p.type].terminals) {
        if (netOf({ partId: p.id, terminalId: t.id }) === s.net) continue;
        const at = terminalPosition(p, t.id);
        const inside = s.a.y === s.b.y ? at.y === s.a.y && at.x > Math.min(s.a.x, s.b.x) && at.x < Math.max(s.a.x, s.b.x) : at.x === s.a.x && at.y > Math.min(s.a.y, s.b.y) && at.y < Math.max(s.a.y, s.b.y);
        if (inside) pinHits++;
      }
  // Two different nets drawn along the same line.
  let foreignOverlaps = 0;
  let crossings = 0;
  for (let i = 0; i < segs.length; i++)
    for (let j = i + 1; j < segs.length; j++) {
      const s = segs[i];
      const t = segs[j];
      const sH = s.a.y === s.b.y;
      const tH = t.a.y === t.b.y;
      if (sH !== tH) {
        const h = sH ? s : t;
        const v = sH ? t : s;
        if (v.a.x > Math.min(h.a.x, h.b.x) && v.a.x < Math.max(h.a.x, h.b.x) && h.a.y > Math.min(v.a.y, v.b.y) && h.a.y < Math.max(v.a.y, v.b.y)) crossings++;
        continue;
      }
      if (s.net === t.net) continue;
      const collinear = sH ? s.a.y === t.a.y : s.a.x === t.a.x;
      if (!collinear) continue;
      const [sLo, sHi, tLo, tHi] = sH ? [Math.min(s.a.x, s.b.x), Math.max(s.a.x, s.b.x), Math.min(t.a.x, t.b.x), Math.max(t.a.x, t.b.x)] : [Math.min(s.a.y, s.b.y), Math.max(s.a.y, s.b.y), Math.min(t.a.y, t.b.y), Math.max(t.a.y, t.b.y)];
      if (sLo < tHi && tLo < sHi) foreignOverlaps++;
    }

  const labels = partLabelPlacements(snapshot.parts, routes, endpoints, snapshot.blocks);
  const labelRects = [...labels.placed.values()];
  const fixed = labels.occupied.slice(0, labels.occupied.length - labelRects.length);
  const labelHits = labelRects.filter((r) => fixed.some((o) => rectsOverlap(r, o))).length;
  for (const [id, r] of labels.placed) if (fixed.some((o) => rectsOverlap(r, o))) detail.push(`label ${id} on something`);
  let labelPairs = 0;
  for (let i = 0; i < labelRects.length; i++) for (let j = i + 1; j < labelRects.length; j++) if (rectsOverlap(labelRects[i], labelRects[j])) labelPairs++;

  const resolved = resolveProbes(probes, snapshot.parts, g.terminalNet);
  const flags = resolved.flatMap((p) => {
    const at = endpoints.resolve(p.terminal);
    return at ? [{ id: p.id, text: `${p.label} · 0.00V`, anchor: at }] : [];
  });
  const flagRects = [...probeTagPlacements(flags, [], labels.occupied, labels.wires).values()];
  const flagHits = flagRects.filter((r) => labels.occupied.some((o) => rectsOverlap(r, o))).length;

  return { bodyHits, pinHits, foreignOverlaps, crossings, labelHits, labelPairs, flagHits, wires: routes.length, detail };
}

describe("schematic drawing quality across every preset", () => {
  for (const preset of presets) {
    it(`${preset.id}: no wire through a body or a foreign pin, no two nets on one line, no label on anything`, () => {
      const d = defects(preset.id);
      expect(d, JSON.stringify(d)).toMatchObject({ bodyHits: 0, pinHits: 0, foreignOverlaps: 0, labelHits: 0, labelPairs: 0, flagHits: 0 });
    });
  }

  it("keeps wire crossings rare over the whole library", () => {
    const total = presets.reduce((sum, p) => sum + defects(p.id).crossings, 0);
    expect(total).toBeLessThanOrEqual(24);
  });
});
