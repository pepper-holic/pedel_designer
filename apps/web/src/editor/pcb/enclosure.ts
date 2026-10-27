/**
 * Enclosure drill templates (plan Stage E-4): where the holes go on a die-cast box, printed at true
 * size to tape on and centre-punch.
 *
 * Faces, as a builder holds the box with the footswitch towards them:
 * - `top`: the face with knobs and footswitch. x across the width, y down the length from the far
 *   (top) end.
 * - `right` / `left`: the long sides. x along the length from the top end, y down from the top face.
 *   Input jack on the right, output on the left - the pedal-board convention (signal flows right to
 *   left).
 * - `end`: the far end, where the DC jack goes. x across the width, y down from the top face.
 */

export type Face = "top" | "left" | "right" | "end";

export interface EnclosureSpec {
  id: string;
  label: string;
  /** Outside dimensions in mm (Hammond datasheet, rounded). */
  length: number;
  width: number;
  height: number;
  /** Wall thickness; the inside is smaller by twice this, and a little more for the draft. */
  wall: number;
}

export const ENCLOSURES: EnclosureSpec[] = [
  { id: "1590A", label: "1590A (미니)", length: 92.6, width: 38.5, height: 31, wall: 2.5 },
  { id: "1590B", label: "1590B (표준)", length: 112.4, width: 60.5, height: 31, wall: 2.8 },
  { id: "125B", label: "125B (높은 표준)", length: 122, width: 66, height: 39.5, wall: 3 },
  { id: "1590BB", label: "1590BB (넓은)", length: 119.5, width: 94, height: 34, wall: 3 },
];

export interface DrillHole {
  id: string;
  label: string;
  face: Face;
  x: number;
  y: number;
  diameter: number;
  kind: "pot" | "switch" | "footswitch" | "led" | "jack" | "dc";
}

/** Standard hole sizes for the usual parts, in mm. */
export const HOLE_SIZES = {
  pot: 7.5, // M7 bushing of 16mm/9mm pots
  switch: 6.5, // 1/4" mini toggle
  footswitch: 12.2, // 3PDT stomp switch
  led: 8, // 5mm LED in a chrome bezel
  jack: 9.5, // 1/4" open-frame jack (3/8" hole)
  dc: 12, // 2.1mm panel-mount DC jack
} as const;

/** Minimum distance between knob centres so two ~19mm knobs do not touch. */
export const KNOB_SPACING = 21;

/** Knob positions on a 112mm-long face, as (fraction of width, mm from the top end). */
function knobGrid(count: number, narrow: boolean): [number, number][] {
  if (narrow) return Array.from({ length: count }, (_, i) => [0.5, 18 + i * 22]);
  switch (count) {
    case 0:
      return [];
    case 1:
      return [[0.5, 22]];
    case 2:
      return [
        [0.28, 22],
        [0.72, 22],
      ];
    case 3:
      return [
        [0.22, 19],
        [0.78, 19],
        [0.5, 40],
      ];
    case 4:
      return [
        [0.28, 19],
        [0.72, 19],
        [0.28, 41],
        [0.72, 41],
      ];
    default: {
      // Rows of three.
      return Array.from({ length: count }, (_, i) => [0.2 + 0.3 * (i % 3), 17 + Math.floor(i / 3) * 21]);
    }
  }
}

export interface PanelControl {
  label: string;
  kind: "knob" | "switch";
}

/** A sensible starting layout for the controls the circuit exposes, plus the usual jacks, LED and footswitch. */
export function defaultDrillPlan(enclosure: EnclosureSpec, controls: PanelControl[]): DrillHole[] {
  const { length: L, width: W, height: H } = enclosure;
  const scale = L / 112;
  const knobs = controls.filter((c) => c.kind === "knob");
  const switches = controls.filter((c) => c.kind === "switch");
  const narrow = W < 50;
  const holes: DrillHole[] = knobGrid(knobs.length, narrow).map(([fx, y], i) => ({
    id: `pot-${i}`,
    label: knobs[i].label,
    face: "top",
    x: W * fx,
    y: y * scale,
    diameter: HOLE_SIZES.pot,
    kind: "pot",
  }));
  const lastKnobY = holes.reduce((m, h) => Math.max(m, h.y), 0);
  switches.forEach((s, i) => {
    holes.push({
      id: `sw-${i}`,
      label: s.label,
      face: "top",
      x: (W * (i + 1)) / (switches.length + 1),
      y: (holes.length > 0 ? lastKnobY : 10) + 16 * scale,
      diameter: HOLE_SIZES.switch,
      kind: "switch",
    });
  });
  holes.push(
    { id: "led", label: "LED", face: "top", x: W / 2, y: L - 45 * scale, diameter: HOLE_SIZES.led, kind: "led" },
    { id: "footswitch", label: "풋스위치", face: "top", x: W / 2, y: L - 24 * scale, diameter: HOLE_SIZES.footswitch, kind: "footswitch" },
    { id: "in", label: "IN", face: "right", x: 30 * scale, y: H / 2, diameter: HOLE_SIZES.jack, kind: "jack" },
    { id: "out", label: "OUT", face: "left", x: 30 * scale, y: H / 2, diameter: HOLE_SIZES.jack, kind: "jack" },
    { id: "dc", label: "DC 9V", face: "end", x: W / 2, y: H / 2, diameter: HOLE_SIZES.dc, kind: "dc" },
  );
  return holes;
}

/** Width and height of a face, in its own x/y. */
export function faceSize(enclosure: EnclosureSpec, face: Face): { w: number; h: number } {
  switch (face) {
    case "top":
      return { w: enclosure.width, h: enclosure.length };
    case "left":
    case "right":
      return { w: enclosure.length, h: enclosure.height };
    case "end":
      return { w: enclosure.width, h: enclosure.height };
  }
}

/** Inside floor of the box, for checking a board fits. */
export function interior(enclosure: EnclosureSpec): { length: number; width: number } {
  // Die-cast walls have draft and a lid lip: keep 1mm more on each side than the wall alone.
  const margin = 2 * (enclosure.wall + 1);
  return { length: enclosure.length - margin, width: enclosure.width - margin };
}

/** Whether a board of this size lies flat inside, and which way round. */
export function boardFit(enclosure: EnclosureSpec, boardW: number, boardH: number): { fits: boolean; rotated: boolean } {
  const inside = interior(enclosure);
  if (boardW <= inside.width && boardH <= inside.length) return { fits: true, rotated: false };
  if (boardH <= inside.width && boardW <= inside.length) return { fits: true, rotated: true };
  return { fits: false, rotated: false };
}

/** The smallest listed box (by top-face area) the board fits in. */
export function smallestFit(boardW: number, boardH: number): EnclosureSpec | null {
  const sorted = [...ENCLOSURES].sort((a, b) => a.length * a.width - b.length * b.width);
  return sorted.find((e) => boardFit(e, boardW, boardH).fits) ?? null;
}

export interface HoleIssue {
  holeId: string;
  message: string;
}

/** Holes too close to an edge (where the wall or lid lip is), overlapping, or knobs too tight to turn. */
export function checkHoles(enclosure: EnclosureSpec, holes: DrillHole[]): HoleIssue[] {
  const issues: HoleIssue[] = [];
  for (const h of holes) {
    const { w, h: fh } = faceSize(enclosure, h.face);
    const r = h.diameter / 2;
    // The wall itself, plus room for the part's nut and washer.
    const edge = enclosure.wall + 2;
    if (h.x - r < edge || h.x + r > w - edge || h.y - r < edge || h.y + r > fh - edge) issues.push({ holeId: h.id, message: `${h.label}: 가장자리(벽)에 너무 가깝습니다.` });
  }
  for (let i = 0; i < holes.length; i++) {
    for (let j = i + 1; j < holes.length; j++) {
      const a = holes[i];
      const b = holes[j];
      if (a.face !== b.face) continue;
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d < a.diameter / 2 + b.diameter / 2 + 3) issues.push({ holeId: b.id, message: `${a.label}와(과) ${b.label} 구멍이 너무 가깝습니다 (${d.toFixed(1)}mm).` });
      else if (a.kind === "pot" && b.kind === "pot" && d < KNOB_SPACING) issues.push({ holeId: b.id, message: `${a.label}와(과) ${b.label} 노브가 서로 닿습니다 (중심 간격 ${d.toFixed(1)}mm < ${KNOB_SPACING}mm).` });
    }
  }
  return issues;
}
