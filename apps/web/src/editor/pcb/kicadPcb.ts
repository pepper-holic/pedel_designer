import type { BoardNetlist } from "./boardNetlist";
import { boardPads } from "./pcbRoute";
import type { PcbLayout } from "./pcbTypes";

const q = (text: string) => `"${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
const n = (v: number) => String(Math.round(v * 1e4) / 1e4);

/**
 * The routed board as a KiCad 8 `.kicad_pcb` (plan Stage E-3) - the editable form: open it in
 * KiCad to adjust, run its DRC, and plot Gerbers. Footprints are written out in full with the
 * geometry this app placed (pads, body outline on the silkscreen) and carry their library names,
 * so "Update footprints from library" swaps in KiCad's own. Wire links have no copper form on a
 * single-sided board, so they go on the front silkscreen as lines - KiCad will show those
 * connections as unrouted, which is exactly what they are until the wire is soldered.
 */
export function buildKicadPcb(layout: PcbLayout, board: BoardNetlist): string {
  let uuidCounter = 0;
  const uuid = () => `00000000-0000-4000-8000-${String(++uuidCounter).padStart(12, "0")}`;
  const nets = ["", ...board.nets];
  const netNum = new Map(nets.map((name, i) => [name, i]));
  const netRef = (name: string) => `(net ${netNum.get(name) ?? 0} ${q(name)})`;
  const font = "(effects (font (size 1 1) (thickness 0.15)))";
  const stroke = (w: number) => `(stroke (width ${w}) (type solid))`;

  const padsByRef = new Map<string, ReturnType<typeof boardPads>>();
  for (const p of boardPads(layout.components, board)) {
    if (!padsByRef.has(p.ref)) padsByRef.set(p.ref, []);
    padsByRef.get(p.ref)!.push(p);
  }

  const footprints = layout.components.map((c) => {
    const fp = c.footprint;
    const nets = new Map((padsByRef.get(c.ref) ?? []).map((p) => [p.number, p.net]));
    const b = fp.body;
    const outline =
      b.kind === "rect"
        ? `    (fp_rect (start ${n(b.x)} ${n(b.y)}) (end ${n(b.x + b.w)} ${n(b.y + b.h)}) ${stroke(0.12)} (fill none) (layer "F.SilkS") (uuid ${q(uuid())}))`
        : `    (fp_circle (center ${n(b.cx)} ${n(b.cy)}) (end ${n(b.cx + b.r)} ${n(b.cy)}) ${stroke(0.12)} (fill none) (layer "F.SilkS") (uuid ${q(uuid())}))`;
    const pads = fp.pads.map((pad) => {
      const net = nets.get(pad.number) ?? "";
      const shape = pad.shape === "rect" ? "rect" : "circle";
      return `    (pad ${q(pad.number)} thru_hole ${shape} (at ${n(pad.x)} ${n(pad.y)} ${c.rotation}) (size ${n(pad.sizeMm)} ${n(pad.sizeMm)}) (drill ${n(pad.drillMm)}) (layers "*.Cu" "*.Mask")${net ? ` ${netRef(net)}` : ""} (uuid ${q(uuid())}))`;
    });
    return [
      `  (footprint ${q(fp.kicadName)}`,
      `    (layer "F.Cu")`,
      `    (uuid ${q(uuid())})`,
      `    (at ${n(c.x)} ${n(c.y)}${c.rotation ? ` ${c.rotation}` : ""})`,
      `    (property "Reference" ${q(c.ref)} (at 0 -2.5 ${c.rotation}) (layer "F.SilkS") (uuid ${q(uuid())}) ${font})`,
      `    (property "Value" ${q(c.value)} (at 0 2.5 ${c.rotation}) (layer "F.Fab") (uuid ${q(uuid())}) ${font})`,
      `    (property "Footprint" ${q(fp.kicadName)} (at 0 0 0) (layer "F.Fab") (hide yes) (uuid ${q(uuid())}) ${font})`,
      outline,
      ...pads,
      `  )`,
    ].join("\n");
  });

  const segments = layout.tracks.flatMap((t) =>
    t.points.slice(1).map((b, i) => {
      const a = t.points[i];
      return `  (segment (start ${n(a.x)} ${n(a.y)}) (end ${n(b.x)} ${n(b.y)}) (width ${n(t.width)}) (layer ${q(t.layer)}) (net ${netNum.get(t.net) ?? 0}) (uuid ${q(uuid())}))`;
    }),
  );
  const vias = layout.vias.map((v) => `  (via (at ${n(v.x)} ${n(v.y)}) (size ${n(v.size)}) (drill ${n(v.drill)}) (layers "F.Cu" "B.Cu") (net ${netNum.get(v.net) ?? 0}) (uuid ${q(uuid())}))`);
  const links = layout.links.map(
    (l) => `  (gr_line (start ${n(l.a.x)} ${n(l.a.y)}) (end ${n(l.b.x)} ${n(l.b.y)}) ${stroke(0.6)} (layer "F.SilkS") (uuid ${q(uuid())}))`,
  );

  return [
    `(kicad_pcb`,
    `  (version 20240108)`,
    `  (generator "pedal_designer")`,
    `  (generator_version "1.0")`,
    `  (general (thickness 1.6) (legacy_teardrops no))`,
    `  (paper "A4")`,
    `  (layers`,
    `    (0 "F.Cu" signal)`,
    `    (31 "B.Cu" signal)`,
    `    (36 "B.SilkS" user "B.Silkscreen")`,
    `    (37 "F.SilkS" user "F.Silkscreen")`,
    `    (38 "B.Mask" user)`,
    `    (39 "F.Mask" user)`,
    `    (44 "Edge.Cuts" user)`,
    `    (46 "B.CrtYd" user "B.Courtyard")`,
    `    (47 "F.CrtYd" user "F.Courtyard")`,
    `    (48 "B.Fab" user)`,
    `    (49 "F.Fab" user)`,
    `  )`,
    `  (setup (pad_to_mask_clearance 0))`,
    ...nets.map((name, i) => `  (net ${i} ${q(name)})`),
    ...footprints,
    ...segments,
    ...vias,
    ...links,
    `  (gr_rect (start 0 0) (end ${n(layout.width)} ${n(layout.height)}) ${stroke(0.1)} (fill none) (layer "Edge.Cuts") (uuid ${q(uuid())}))`,
    `)`,
    "",
  ].join("\n");
}
