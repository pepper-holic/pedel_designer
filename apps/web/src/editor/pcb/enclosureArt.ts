import type { DrillHole, EnclosureSpec } from "./enclosure";
import { shapesToSvg, type Shape } from "./stripboardDrawing";
import type { PedalAppearance } from "../player/pedalAppearance";

/**
 * The top face as a printable decal (plan Stage E-5): the same body/text/accent/font the player
 * view uses, laid out at the real hole positions so it can be printed 1:1, stuck onto the box, then
 * drilled through - the control labels and the hole centres line up because both come from the
 * same `defaultDrillPlan` the drill template uses.
 */
export function enclosureArtShapes(enclosure: EnclosureSpec, holes: DrillHole[], appearance: PedalAppearance, title: string): Shape[] {
  const { width: W, length: L } = enclosure;
  const font = appearance.fontFamily;
  const top = holes.filter((h) => h.face === "top");
  const shapes: Shape[] = [
    { kind: "rect", x: 0, y: 0, w: W, h: L, fill: appearance.bodyColor },
    // A faint printed sheen, the way a screened graphic on brushed metal picks up top light.
    { kind: "rect", x: 0, y: 0, w: W, h: L * 0.35, fill: "#ffffff", opacity: 0.08 },
    { kind: "rect", x: 0, y: L * 0.7, w: W, h: L * 0.3, fill: "#000000", opacity: 0.12 },
    { kind: "rect", x: 0.8, y: 0.8, w: W - 1.6, h: L - 1.6, fill: "none", stroke: appearance.accentColor, sw: 0.3, opacity: 0.5 },
    {
      kind: "text",
      x: W / 2,
      y: Math.min(10, L * 0.09),
      text: title,
      size: Math.min(W * 0.1, 5.2),
      fill: appearance.accentColor,
      anchor: "middle",
      bold: true,
      fontFamily: font,
    },
  ];
  for (const hole of top) {
    if (hole.kind !== "pot" && hole.kind !== "switch") continue;
    const r = hole.diameter / 2;
    // A faint alignment ring, not a cut hole - the decal goes on whole, then gets drilled through.
    shapes.push({ kind: "circle", cx: hole.x, cy: hole.y, r, fill: "none", stroke: appearance.textColor, sw: 0.2, opacity: 0.35 });
    shapes.push({
      kind: "text",
      x: hole.x,
      y: hole.y - r - 2.2,
      text: hole.label,
      size: 2.6,
      fill: appearance.textColor,
      anchor: "middle",
      bold: true,
      fontFamily: font,
    });
  }
  return shapes;
}

/** True-size top-face decal to print at 100%, laminate, and stick on before drilling. */
export function enclosureArtSvg(enclosure: EnclosureSpec, holes: DrillHole[], appearance: PedalAppearance, title: string): string {
  return shapesToSvg(enclosureArtShapes(enclosure, holes, appearance, title), enclosure.width, enclosure.length);
}
