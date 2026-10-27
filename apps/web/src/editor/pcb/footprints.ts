/**
 * Through-hole footprints for pedal building (plan Stage E-1). Geometry in millimetres, KiCad's
 * convention: pad 1 at the origin, x to the right, y down. Each entry names the KiCad library
 * footprint it stands for, so an exported netlist opens in KiCad with real footprints, and carries
 * enough geometry (pads, body outline) for the stripboard and PCB generators to place it.
 */

export interface PadDef {
  /** Pad number as KiCad numbers it ("1", "2", ...). */
  number: string;
  x: number;
  y: number;
  drillMm: number;
  /** Copper diameter (or side, for a square pad 1). */
  sizeMm: number;
  shape: "circle" | "rect";
}

export interface FootprintDef {
  id: string;
  label: string;
  /** "Library:Footprint" in KiCad 8's bundled libraries. */
  kicadName: string;
  pads: PadDef[];
  /** Body outline for silkscreen and overlap checks: a rectangle or circle in footprint coordinates. */
  body: { kind: "rect"; x: number; y: number; w: number; h: number } | { kind: "circle"; cx: number; cy: number; r: number };
  /**
   * Which pad each schematic terminal lands on, by terminal id. Absent: terminal i goes to pad i+1.
   * This is where transistor pin orders (EBC vs CBE) and diode/electrolytic polarity live - a wrong
   * entry here is a board that does not work, so it is data with tests, not a convention.
   */
  pinout?: Record<string, string>;
  /** Pads with no schematic terminal that still need a net (an op-amp's supply pins). */
  supplyPads?: { number: string; net: "V+" | "V-" | "GND" }[];
  /** A set of wire pads - the real part (jack, footswitch, panel pot) is mounted off the board. */
  offBoard?: boolean;
  /** Pad 1 is the + lead (electrolytic). */
  polarized?: boolean;
}

const pad = (number: number, x: number, y: number, drillMm = 0.8, sizeMm = 1.6): PadDef => ({ number: String(number), x, y, drillMm, sizeMm, shape: number === 1 ? "rect" : "circle" });

/** Two leads `pitch` apart on the x axis with a rectangular body between them. */
function axial(id: string, label: string, kicadName: string, pitch: number, bodyW: number, bodyH: number, extra: Partial<FootprintDef> = {}): FootprintDef {
  return { id, label, kicadName, pads: [pad(1, 0, 0), pad(2, pitch, 0)], body: { kind: "rect", x: pitch / 2 - bodyW / 2, y: -bodyH / 2, w: bodyW, h: bodyH }, ...extra };
}

/** Two leads `pitch` apart under a round body (radial electrolytics, LEDs, inductors). */
function radial(id: string, label: string, kicadName: string, pitch: number, diameter: number, extra: Partial<FootprintDef> = {}): FootprintDef {
  return { id, label, kicadName, pads: [pad(1, 0, 0), pad(2, pitch, 0)], body: { kind: "circle", cx: pitch / 2, cy: 0, r: diameter / 2 }, ...extra };
}

/** TO-92 with its legs bent out to 2.54mm - what stripboard and hand soldering want. */
function to92(id: string, order: string, pinout: Record<string, string>): FootprintDef {
  return {
    id,
    label: `TO-92 (${order})`,
    kicadName: "Package_TO_SOT_THT:TO-92_Inline_Wide",
    pads: [pad(1, 0, 0, 0.75, 1.5), pad(2, 2.54, 0, 0.75, 1.5), pad(3, 5.08, 0, 0.75, 1.5)],
    body: { kind: "rect", x: 0.04, y: -2.6, w: 5, h: 3.8 },
    pinout,
  };
}

/** A row of wire pads for something mounted off the board. */
function wirePads(count: number): FootprintDef {
  const pads = Array.from({ length: count }, (_, i) => pad(i + 1, 0, i * 2.54, 1.0, 1.8));
  return {
    id: `wire${count}`,
    label: `와이어 패드 ${count}개 (오프보드)`,
    kicadName: `Connector_PinHeader_2.54mm:PinHeader_1x${String(count).padStart(2, "0")}_P2.54mm_Vertical`,
    pads,
    body: { kind: "rect", x: -1.27, y: -1.27, w: 2.54, h: count * 2.54 },
    offBoard: true,
  };
}

const BJT_PINOUTS: Record<string, Record<string, string>> = {
  EBC: { emitter: "1", base: "2", collector: "3" },
  CBE: { collector: "1", base: "2", emitter: "3" },
  ECB: { emitter: "1", collector: "2", base: "3" },
  BCE: { base: "1", collector: "2", emitter: "3" },
};
const JFET_PINOUTS: Record<string, Record<string, string>> = {
  DSG: { drain: "1", source: "2", gate: "3" },
  GSD: { gate: "1", source: "2", drain: "3" },
  SGD: { source: "1", gate: "2", drain: "3" },
};

const LIST: FootprintDef[] = [
  axial("r-axial-10", "저항 축형 1/4W, 10.16mm", "Resistor_THT:R_Axial_DIN0207_L6.3mm_D2.5mm_P10.16mm_Horizontal", 10.16, 6.3, 2.5),
  axial("r-axial-7", "저항 축형 1/4W, 7.62mm", "Resistor_THT:R_Axial_DIN0207_L6.3mm_D2.5mm_P7.62mm_Horizontal", 7.62, 6.3, 2.5),
  {
    id: "r-vertical",
    label: "저항 세워 꽂기, 2.54mm",
    kicadName: "Resistor_THT:R_Axial_DIN0207_L6.3mm_D2.5mm_P2.54mm_Vertical",
    pads: [pad(1, 0, 0), pad(2, 2.54, 0)],
    body: { kind: "circle", cx: 0, cy: 0, r: 1.25 },
  },
  axial("c-film-5", "필름 박스 5mm", "Capacitor_THT:C_Rect_L7.2mm_W2.5mm_P5.00mm_FKS2_FKP2_MKS2_MKP2", 5, 7.2, 2.5),
  axial("c-film-2.5", "필름 박스 2.5mm", "Capacitor_THT:C_Rect_L4.6mm_W2.0mm_P2.50mm_MKS02_FKP02", 2.5, 4.6, 2),
  axial("c-film-7.5", "필름 박스 7.5mm", "Capacitor_THT:C_Rect_L10.0mm_W3.0mm_P7.50mm_MKS4", 7.5, 10, 3),
  axial("c-disc-2.5", "세라믹 디스크 2.5mm", "Capacitor_THT:C_Disc_D3.0mm_W1.6mm_P2.50mm", 2.5, 3, 1.6),
  radial("cp-5", "전해 5mm, 2mm 피치", "Capacitor_THT:CP_Radial_D5.0mm_P2.00mm", 2, 5, { polarized: true }),
  radial("cp-6.3", "전해 6.3mm, 2.5mm 피치", "Capacitor_THT:CP_Radial_D6.3mm_P2.50mm", 2.5, 6.3, { polarized: true }),
  radial("cp-8", "전해 8mm, 3.5mm 피치", "Capacitor_THT:CP_Radial_D8.0mm_P3.50mm", 3.5, 8, { polarized: true }),
  axial("d-do35", "다이오드 DO-35, 7.62mm", "Diode_THT:D_DO-35_SOD27_P7.62mm_Horizontal", 7.62, 4, 2, { pinout: { cathode: "1", anode: "2" } }),
  axial("d-do41", "다이오드 DO-41, 10.16mm", "Diode_THT:D_DO-41_SOD81_P10.16mm_Horizontal", 10.16, 5.2, 2.7, { pinout: { cathode: "1", anode: "2" } }),
  radial("led-3", "LED 3mm", "LED_THT:LED_D3.0mm", 2.54, 3, { pinout: { cathode: "1", anode: "2" } }),
  radial("led-5", "LED 5mm", "LED_THT:LED_D5.0mm", 2.54, 5, { pinout: { cathode: "1", anode: "2" } }),
  radial("l-radial", "인덕터 방사형 5mm", "Inductor_THT:L_Radial_D7.8mm_P5.00mm_Fastron_07HCP", 5, 7.8),
  ...Object.entries(BJT_PINOUTS).map(([order, pinout]) => to92(`to92-${order.toLowerCase()}`, order, pinout)),
  ...Object.entries(JFET_PINOUTS).map(([order, pinout]) => to92(`to92-${order.toLowerCase()}`, order, pinout)),
  {
    id: "dip8-single",
    label: "DIP-8 단일 op-amp (TL071/LM741 핀배치)",
    kicadName: "Package_DIP:DIP-8_W7.62mm",
    pads: [1, 2, 3, 4].map((n) => pad(n, 0, (n - 1) * 2.54)).concat([5, 6, 7, 8].map((n) => pad(n, 7.62, (8 - n) * 2.54))),
    body: { kind: "rect", x: 1.27, y: -1.27, w: 5.08, h: 10.16 },
    pinout: { inMinus: "2", inPlus: "3", out: "6" },
    supplyPads: [
      { number: "7", net: "V+" },
      { number: "4", net: "V-" },
    ],
  },
  {
    id: "pot-16",
    label: "포텐셔미터 16mm PCB 마운트",
    kicadName: "Potentiometer_THT:Potentiometer_Alpha_RD901F-40-00D_Single_Vertical",
    pads: [pad(1, 0, 0, 1.2, 2.2), pad(2, 5, 0, 1.2, 2.2), pad(3, 10, 0, 1.2, 2.2)],
    body: { kind: "circle", cx: 5, cy: -7.5, r: 8 },
    pinout: { a: "1", wiper: "2", b: "3" },
  },
  {
    id: "pot-9",
    label: "포텐셔미터 9mm PCB 마운트",
    kicadName: "Potentiometer_THT:Potentiometer_Alps_RK09K_Single_Vertical",
    pads: [pad(1, 0, 0, 1.0, 1.8), pad(2, 2.5, 0, 1.0, 1.8), pad(3, 5, 0, 1.0, 1.8)],
    body: { kind: "rect", x: -2.25, y: -11, w: 9.5, h: 10 },
    pinout: { a: "1", wiper: "2", b: "3" },
  },
  { ...wirePads(3), id: "pot-panel", label: "패널 마운트 포트 (와이어 패드 3개)", pinout: { a: "1", wiper: "2", b: "3" } },
  ...[2, 3, 4, 6, 7].map(wirePads),
];

export const FOOTPRINTS: Record<string, FootprintDef> = Object.fromEntries(LIST.map((f) => [f.id, f]));

/** Pad number for a schematic terminal on this footprint. */
export function padForTerminal(footprint: FootprintDef, terminalId: string, terminalIndex: number): string {
  return footprint.pinout?.[terminalId] ?? String(terminalIndex + 1);
}

/** Bounding box of a footprint's pads and body, in footprint coordinates. */
export function footprintBounds(footprint: FootprintDef): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of footprint.pads) {
    const r = p.sizeMm / 2;
    minX = Math.min(minX, p.x - r);
    minY = Math.min(minY, p.y - r);
    maxX = Math.max(maxX, p.x + r);
    maxY = Math.max(maxY, p.y + r);
  }
  const b = footprint.body;
  if (b.kind === "rect") {
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.w);
    maxY = Math.max(maxY, b.y + b.h);
  } else {
    minX = Math.min(minX, b.cx - b.r);
    minY = Math.min(minY, b.cy - b.r);
    maxX = Math.max(maxX, b.cx + b.r);
    maxY = Math.max(maxY, b.cy + b.r);
  }
  return { minX, minY, maxX, maxY };
}
