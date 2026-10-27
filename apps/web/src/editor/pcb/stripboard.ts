import type { BoardComponent, BoardNetlist } from "./boardNetlist";
import type { FootprintDef } from "./footprints";
import type { Hole, StripboardLayout, StripJumper, StripPin, StripPlacement } from "./stripboardTypes";
import { verifyStripboard } from "./stripboardVerify";

/** What each layout choice costs. A jumper is a wire to cut, strip and solder twice - the thing
 * builders most want fewer of; a new strip row is board area; a new segment usually means a cut. */
const JUMPER_COST = 10;
const START_COST = 1;
const NEW_ROW_COST = 3;
const NEW_COLUMN_COST = 0.6;
const SPAN_COST = 0.05;
const TRIALS = 40;

type Kind = StripPlacement["kind"];

function kindOf(footprint: FootprintDef): Kind {
  // Pots and switches on a stripboard are wired to the panel, not soldered in - flying leads.
  if (footprint.offBoard || footprint.id.startsWith("pot-")) return "flex";
  if (footprint.id.startsWith("dip")) return "dip";
  if (footprint.pads.length === 3) return "inline";
  if (footprint.pads.length === 2) return "lead2";
  return "flex";
}

/** How many rows a two-lead part's legs may span when stood along a column. */
function spanRange(footprint: FootprintDef): [number, number] {
  const [a, b] = footprint.pads;
  const pitch = Math.hypot(b.x - a.x, b.y - a.y);
  // Axial resistors and diodes lie flat over a few holes or stand up in adjacent ones.
  if (footprint.body.kind === "rect" && pitch >= 7) return [1, 8];
  if (footprint.id === "r-vertical") return [1, 2];
  // Radial and box parts have fixed lead spacing; the legs bend out by a hole at most.
  const n = Math.max(1, Math.round(pitch / 2.54));
  return [n, n + 1];
}

/** Columns either side of the leads that the body overhangs (a fat electrolytic covers its neighbours). */
function overhang(footprint: FootprintDef): number {
  const b = footprint.body;
  const half = b.kind === "circle" ? b.r : Math.min(b.w, b.h) / 2;
  return half > 2.54 ? 1 : 0;
}

/** A small deterministic PRNG, so a layout is the same every time for the same circuit. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Candidate {
  pins: StripPin[];
  body: StripPlacement["body"];
  /** DIP only: rows its body cuts, the column the cut goes in, and its empty lead-in column. */
  dip?: { rows: number[]; cutCol: number; preCol: number; leftCount: number };
}

const k = (row: number, col: number) => `${row},${col}`;

/**
 * One left-to-right sweep. Parts are placed in signal order, each in the next column(s), each lead
 * on a strip already carrying its net where possible, otherwise on a fresh strip segment. A strip
 * whose net has no pins left is cut and reused. When a part's geometry forces a lead onto a strip
 * away from its net (a TO-92's three legs must be on three adjacent strips), a jumper joins the two.
 */
class Sweep {
  rows = 0;
  lastCol = -1;
  /** Rightmost column any body or jumper covers - a DIP's lead-in column must be clear of them. */
  lastBodyCol = -1;
  /** The strip segment each row has open at the sweep front: from `start` (just past its last cut)
   * rightwards, with `last` the rightmost hole it uses so far. */
  readonly open = new Map<number, { net: string; start: number; last: number }>();
  /** Column of each row's most recent cut, -1 for none. */
  readonly cutAt: number[] = [];
  /** Set when a jumper had nowhere to go - the sweep is abandoned and another trial wins. */
  failed = false;
  readonly freeFrom: number[] = [];
  readonly closedEnd: number[] = [];
  readonly holes = new Set<string>();
  readonly bodyCells = new Set<string>();
  readonly cuts = new Map<string, Hole>();
  readonly jumpers: StripJumper[] = [];
  readonly placements: StripPlacement[] = [];
  readonly remaining = new Map<string, number>();
  private readonly noise: () => number;

  constructor(board: BoardNetlist, noise: () => number) {
    this.noise = noise;
    for (const c of board.components) for (const p of c.pads) if (p.net) this.remaining.set(p.net, (this.remaining.get(p.net) ?? 0) + 1);
  }

  private openRowsOf(net: string): number[] {
    const rows: number[] = [];
    for (const [row, seg] of this.open) if (seg.net === net) rows.push(row);
    return rows;
  }

  private cellFree(row: number, col: number) {
    return row >= 0 && col >= 0 && !this.holes.has(k(row, col)) && !this.bodyCells.has(k(row, col));
  }

  private status(row: number, col: number, net: string): "extend" | "start" | "nc" | "blocked" {
    const seg = this.open.get(row);
    if (seg) return seg.net === net ? "extend" : net === "" ? "nc" : "blocked";
    if ((this.freeFrom[row] ?? 0) > col) return "blocked";
    return net === "" ? "nc" : "start";
  }

  private bodyCellsOf(body: StripPlacement["body"]): string[] {
    if (!body) return [];
    const cells: string[] = [];
    for (let r = body.rowFrom; r <= body.rowTo; r++) for (let c = body.colFrom; c <= body.colTo; c++) cells.push(k(r, c));
    return cells;
  }

  /** Cost of placing a candidate without changing anything; Infinity when it does not fit. */
  cost(candidate: Candidate): number {
    let cost = 0;
    let newRows = 0;
    const started = new Set<string>();
    const ownPins = new Set(candidate.pins.map((p) => k(p.row, p.col)));
    for (const cell of this.bodyCellsOf(candidate.body)) {
      if (this.bodyCells.has(cell) || (this.holes.has(cell) && !ownPins.has(cell))) return Infinity;
      const row = Number(cell.split(",")[0]);
      if (row < 0) return Infinity;
    }
    const dip = candidate.dip;
    candidate.pins.forEach((pin, i) => {
      if (cost === Infinity) return;
      if (!this.cellFree(pin.row, pin.col)) return void (cost = Infinity);
      // A DIP's right-hand pins sit on strips its own cut has just freed; its left-hand strips must
      // already be usable in the lead-in column, where any jumper for them goes.
      const st = dip && i >= dip.leftCount ? (pin.net === "" ? "nc" : "start") : this.status(pin.row, dip ? dip.preCol : pin.col, pin.net);
      if (st === "blocked") return void (cost = Infinity);
      newRows = Math.max(newRows, pin.row - this.rows + 1);
      if (st !== "start") return;
      const leftSide = !dip || i < dip.leftCount;
      const elsewhere = this.openRowsOf(pin.net).some((r) => leftSide || !dip.rows.includes(r)) || started.has(pin.net);
      cost += elsewhere ? JUMPER_COST : START_COST;
      started.add(pin.net);
    });
    if (cost === Infinity) return cost;
    if (dip) {
      // Nets cut off by the IC's strip cuts that still have pins to reach need a jumper around it.
      for (const row of dip.rows) {
        const net = this.open.get(row)?.net ?? candidate.pins.find((p) => p.row === row && p.col < dip.cutCol)?.net;
        if (!net) continue;
        const ownPins = candidate.pins.filter((p) => p.net === net).length;
        const stillNeeded = (this.remaining.get(net) ?? 0) - ownPins > 0 || candidate.pins.some((p, i) => i >= dip.leftCount && p.net === net);
        const otherRow = this.openRowsOf(net).some((r) => !dip.rows.includes(r));
        if (stillNeeded && !otherRow) cost += JUMPER_COST;
      }
    }
    const maxCol = Math.max(...candidate.pins.map((p) => p.col), candidate.body?.colTo ?? 0);
    cost += Math.max(0, maxCol - this.lastCol) * NEW_COLUMN_COST;
    return cost + newRows * NEW_ROW_COST + this.noise() * 0.01;
  }

  private ensureRows(row: number) {
    if (row >= this.rows) this.rows = row + 1;
  }

  private cut(row: number, col: number) {
    this.cuts.set(k(row, col), { row, col });
    this.cutAt[row] = col;
  }

  /** Opens `row` for `net` at `col`, cutting off whatever net used the row before. */
  private startSegment(row: number, net: string, col: number) {
    this.ensureRows(row);
    const ended = this.closedEnd[row];
    if (ended !== undefined && ended >= 0) this.cut(row, ended + 1);
    this.closedEnd[row] = -1;
    this.open.set(row, { net, start: (this.cutAt[row] ?? -1) + 1, last: col });
  }

  private touch(row: number, col: number) {
    const seg = this.open.get(row)!;
    seg.last = Math.max(seg.last, col);
    this.lastCol = Math.max(this.lastCol, col);
  }

  /** Ends a row's segment. `cutAfter` forces the cut right after that column now (a DIP's strips). */
  private closeRow(row: number, cutAfter?: number) {
    const seg = this.open.get(row);
    if (!seg) return;
    this.open.delete(row);
    const last = Math.max(seg.last, cutAfter ?? -1);
    this.closedEnd[row] = last;
    this.freeFrom[row] = last + 2;
    if (cutAfter !== undefined) {
      this.cut(row, last + 1);
      this.closedEnd[row] = -1;
    }
  }

  /** A free row for `net` to start on at `col` (an existing free strip, else a new one at the bottom). */
  private freeRow(col: number, avoid: number[] = []): number {
    for (let row = 0; row < this.rows; row++) {
      if (avoid.includes(row) || this.open.has(row) || (this.freeFrom[row] ?? 0) > col || !this.cellFree(row, col)) continue;
      return row;
    }
    let row = this.rows;
    while (avoid.includes(row)) row++;
    return row;
  }

  /**
   * Links `row` to `toRow` (both open strips of `net`) with a wire in the first of `cols` where it
   * fits: both holes free and on both segments, nothing under the wire in between.
   */
  private jumper(net: string, row: number, toRow: number, cols: number[]) {
    const lo = Math.min(row, toRow);
    const hi = Math.max(row, toRow);
    const minCol = Math.max(this.open.get(row)!.start, this.open.get(toRow)!.start);
    const col = cols.find((c) => {
      if (c < minCol || !this.cellFree(row, c) || !this.cellFree(toRow, c)) return false;
      for (let r = lo + 1; r < hi; r++) if (this.bodyCells.has(k(r, c)) || this.holes.has(k(r, c))) return false;
      return true;
    });
    if (col === undefined) {
      this.failed = true;
      return;
    }
    this.holes.add(k(row, col));
    this.holes.add(k(toRow, col));
    for (let r = lo + 1; r < hi; r++) this.bodyCells.add(k(r, col));
    this.lastBodyCol = Math.max(this.lastBodyCol, col);
    this.touch(row, col);
    this.touch(toRow, col);
    this.jumpers.push({ net, a: { row, col }, b: { row: toRow, col } });
  }

  /** Puts one pin down: on its net's strip, on a new segment, or on a stub strip jumpered to the net. */
  private placePin(pin: StripPin, jumperCols: number[], avoidRows: number[] = []) {
    this.holes.add(k(pin.row, pin.col));
    this.ensureRows(pin.row);
    this.lastCol = Math.max(this.lastCol, pin.col);
    if (!pin.net) return;
    const seg = this.open.get(pin.row);
    if (seg && seg.net === pin.net) return this.touch(pin.row, pin.col);
    const others = this.openRowsOf(pin.net).filter((r) => !avoidRows.includes(r));
    this.startSegment(pin.row, pin.net, pin.col);
    if (others.length > 0) {
      const nearest = others.reduce((a, b) => (Math.abs(b - pin.row) < Math.abs(a - pin.row) ? b : a));
      this.jumper(pin.net, pin.row, nearest, jumperCols);
    }
  }

  private finishPins(pins: StripPin[]) {
    for (const pin of pins) {
      if (!pin.net) continue;
      const left = (this.remaining.get(pin.net) ?? 0) - 1;
      this.remaining.set(pin.net, left);
    }
    for (const pin of pins) {
      if (!pin.net || (this.remaining.get(pin.net) ?? 0) > 0) continue;
      for (const row of this.openRowsOf(pin.net)) this.closeRow(row);
    }
  }

  apply(component: BoardComponent, kind: Kind, candidate: Candidate) {
    for (const cell of this.bodyCellsOf(candidate.body)) this.bodyCells.add(cell);
    if (candidate.body) this.lastBodyCol = Math.max(this.lastBodyCol, candidate.body.colTo);
    const maxCol = Math.max(...candidate.pins.map((p) => p.col), candidate.body?.colTo ?? 0);
    const dip = candidate.dip;
    const after = (from: number) => Array.from({ length: 40 }, (_, i) => from + i);
    if (dip) {
      const left = candidate.pins.slice(0, dip.leftCount);
      const right = candidate.pins.slice(dip.leftCount);
      const cl = left[0].col;
      // Jumpers for the left-hand legs go in the lead-in columns, or anywhere further left still
      // on both strips - never past the IC, where its cuts have split the strips.
      const before = Array.from({ length: cl }, (_, i) => cl - 1 - i);
      for (const pin of left) this.placePin(pin, before);
      // Strips under the IC are cut between its two rows of legs; a net that still has somewhere
      // to go continues on another strip, linked before the IC.
      for (const row of dip.rows) {
        const seg = this.open.get(row);
        if (!seg) continue;
        const net = seg.net;
        const leftHere = left.filter((p) => p.net === net).length;
        const stillNeeded = (this.remaining.get(net) ?? 0) - leftHere > 0;
        const otherRow = this.openRowsOf(net).some((r) => !dip.rows.includes(r));
        if (stillNeeded && !otherRow) {
          const target = this.freeRow(dip.preCol, dip.rows);
          this.startSegment(target, net, dip.preCol);
          this.jumper(net, row, target, before);
        }
        this.closeRow(row, cl);
      }
      this.finishPins(left);
      for (const pin of right) this.placePin(pin, after(maxCol + 1));
      this.finishPins(right);
    } else {
      for (const pin of candidate.pins) this.placePin(pin, after(maxCol + 1));
      this.finishPins(candidate.pins);
    }
    this.lastCol = Math.max(this.lastCol, maxCol);
    this.placements.push({ ref: component.ref, value: component.value, footprintId: component.footprint.id, kind, pins: candidate.pins, body: candidate.body });
  }

  /** Flying-lead pads: each on any strip of its net, in the next free column. */
  placeFlex(component: BoardComponent) {
    const pins: StripPin[] = [];
    const startCol = this.lastCol + 1;
    for (const pad of component.pads) {
      for (let col = startCol; ; col++) {
        const netRows = pad.net ? this.openRowsOf(pad.net) : [];
        const onNet = netRows.find((r) => this.cellFree(r, col));
        const row = onNet ?? (netRows.length === 0 ? this.freeRow(col) : -1);
        if (row < 0 || !this.cellFree(row, col)) continue;
        if (pad.net && !this.open.has(row)) this.startSegment(row, pad.net, col);
        this.holes.add(k(row, col));
        this.ensureRows(row);
        if (pad.net) this.touch(row, col);
        this.lastCol = Math.max(this.lastCol, col);
        pins.push({ pad: pad.number, net: pad.net, row, col });
        break;
      }
    }
    this.finishPins(pins);
    this.placements.push({ ref: component.ref, value: component.value, footprintId: component.footprint.id, kind: "flex", pins, body: null });
  }

  candidates(component: BoardComponent, kind: Kind): Candidate[] {
    const fp = component.footprint;
    const pads = component.pads;
    const out: Candidate[] = [];
    const maxRow = this.rows + 4;
    const hw = overhang(fp);
    if (kind === "lead2") {
      const [minSpan, maxSpan] = spanRange(fp);
      for (const col of [this.lastCol, this.lastCol + 1, this.lastCol + 1 + hw]) {
        if (col - hw < 0) continue;
        for (let ra = 0; ra <= maxRow; ra++) {
          for (let d = minSpan; d <= maxSpan; d++) {
            for (const rb of [ra + d, ra - d]) {
              if (rb < 0) continue;
              const lo = Math.min(ra, rb) - (fp.body.kind === "circle" ? hw : 0);
              const hi = Math.max(ra, rb) + (fp.body.kind === "circle" ? hw : 0);
              out.push({
                pins: [
                  { pad: pads[0].number, net: pads[0].net, row: ra, col },
                  { pad: pads[1].number, net: pads[1].net, row: rb, col },
                ],
                body: { rowFrom: Math.max(0, lo), rowTo: hi, colFrom: col - hw, colTo: col + hw },
              });
            }
          }
        }
      }
    } else if (kind === "inline") {
      for (const col of [this.lastCol, this.lastCol + 1]) {
        if (col < 0) continue;
        for (let b = 0; b <= maxRow; b++) {
          for (const flip of [false, true]) {
            const pins = pads.map((pad, i) => ({ pad: pad.number, net: pad.net, row: b + (flip ? 2 - i : i), col }));
            out.push({ pins, body: { rowFrom: b, rowTo: b + 2, colFrom: col, colTo: col } });
          }
        }
      }
    } else if (kind === "dip") {
      const half = fp.pads.length / 2;
      const byNumber = new Map(pads.map((p) => [Number(p.number), p]));
      // Two empty lead-in columns before the IC, for the jumpers its strip cuts may need.
      const preCol = Math.max(this.lastCol, this.lastBodyCol) + 1;
      const cl = preCol + 2;
      const cr = cl + 3;
      for (let b = 0; b <= maxRow; b++) {
        for (const rotated of [false, true]) {
          const rows = Array.from({ length: half }, (_, i) => b + i);
          // Normal: pins 1..4 down the left, 8..5 down the right. Rotated 180°: 5..8 left, 4..1 right.
          const leftNums = rows.map((_, i) => (rotated ? half + 1 + i : 1 + i));
          const rightNums = rows.map((_, i) => (rotated ? half - i : 2 * half - i));
          const pin = (n: number, row: number, col: number): StripPin => {
            const p = byNumber.get(n);
            return { pad: String(n), net: p?.net ?? "", row, col };
          };
          out.push({
            pins: [...leftNums.map((n, i) => pin(n, rows[i], cl)), ...rightNums.map((n, i) => pin(n, rows[i], cr))],
            body: { rowFrom: b, rowTo: b + half - 1, colFrom: cl, colTo: cr },
            dip: { rows, cutCol: cl + 1, preCol, leftCount: half },
          });
        }
      }
    }
    return out;
  }

  close() {
    for (const row of [...this.open.keys()]) this.closeRow(row);
  }
}

function orderComponents(board: BoardNetlist, partX: Map<string, number>, powerLast: boolean): BoardComponent[] {
  // Power pads either go last - a flying lead can land on any hole of its strip, so they just pick
  // up the strips the circuit already opened, which keeps IC supply pins off jumpers - or first,
  // opening rails along the board edge, which suits discrete transistor circuits. Both are tried.
  const isPower = (c: BoardComponent) => c.value.startsWith("op-amp 전원") || c.value.startsWith("DC 전원") || c.value.startsWith("바이어스");
  const rank = (c: BoardComponent) => (c.value === "출력 잭 (OUT)" ? 2 : isPower(c) ? (powerLast ? 2 : 0) : 1);
  return [...board.components].sort((a, b) => rank(a) - rank(b) || (partX.get(a.partId ?? "") ?? 0) - (partX.get(b.partId ?? "") ?? 0));
}

function runSweep(order: BoardComponent[], board: BoardNetlist, seed: number): StripboardLayout | null {
  const rand = mulberry32(seed);
  const sweep = new Sweep(board, seed === 0 ? () => 0 : rand);
  for (const component of order) {
    const kind = kindOf(component.footprint);
    if (kind === "flex") {
      sweep.placeFlex(component);
      continue;
    }
    let best: Candidate | null = null;
    let bestCost = Infinity;
    for (const candidate of sweep.candidates(component, kind)) {
      const cost = sweep.cost(candidate) + (kind === "lead2" ? Math.abs(candidate.pins[0].row - candidate.pins[1].row) * SPAN_COST : 0);
      if (cost < bestCost) {
        bestCost = cost;
        best = candidate;
      }
    }
    if (!best) throw new Error(`${component.ref}: 스트립보드에 놓을 자리를 찾지 못했습니다.`);
    sweep.apply(component, kind, best);
  }
  sweep.close();
  if (sweep.failed) return null;
  let cols = sweep.lastCol + 1;
  for (const p of sweep.placements) if (p.body) cols = Math.max(cols, p.body.colTo + 1);
  return { rows: Math.max(1, sweep.rows), cols: Math.max(1, cols), placements: sweep.placements, cuts: [...sweep.cuts.values()], jumpers: sweep.jumpers };
}

export function layoutScore(layout: StripboardLayout): number {
  return layout.jumpers.length * JUMPER_COST + layout.cuts.length * 0.5 + layout.rows * layout.cols * 0.05;
}

/**
 * Lays a circuit out on stripboard (plan Stage E-2). Several sweeps with slightly different part
 * orders and tie-breaks run, and the one with the fewest jumpers, then cuts, then holes wins.
 * `partX` is each schematic part's x position - the schematic is already drawn in signal order,
 * which is the order a builder reads a stripboard in too.
 */
export function generateStripboard(board: BoardNetlist, partX: Map<string, number>): StripboardLayout {
  let best: StripboardLayout | null = null;
  let fallback: StripboardLayout | null = null;
  for (let trial = 0; trial < TRIALS; trial++) {
    const order = orderComponents(board, partX, trial % 2 === 0);
    if (trial > 1) {
      // Nudge the order: swap a few neighbours. Signal order is a good start, not the optimum.
      const rand = mulberry32(trial * 7919);
      for (let i = 0; i < order.length / 3; i++) {
        const j = Math.floor(rand() * (order.length - 1));
        if (order[j].partId !== null && order[j + 1].partId !== null) [order[j], order[j + 1]] = [order[j + 1], order[j]];
      }
    }
    const layout = runSweep(order, board, trial);
    // Only a board that reads back as the circuit counts; the score only ranks correct ones.
    if (!layout || !verifyStripboard(layout, board).ok) {
      fallback ??= layout;
      continue;
    }
    if (!best || layoutScore(layout) < layoutScore(best)) best = layout;
  }
  const result = best ?? fallback;
  if (!result) throw new Error("스트립보드 배치에 실패했습니다.");
  return result;
}
